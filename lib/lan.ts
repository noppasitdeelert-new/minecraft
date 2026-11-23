import { ApiError } from "./api";
import { all, nowIso, one, run } from "./db";
import { publishLanPulse } from "./realtime";

/* ------------------------------------------------------------------ */
/*  ศูนย์นัดเล่นไมน์คราฟต์ผ่าน LAN / VPN                                */
/*                                                                    */
/*  เว็บนี้ไม่ได้สร้างอุโมงค์ VPN ให้เอง (Worker ไม่มี network stack)   */
/*  แต่ทำหน้าที่เป็นศูนย์นัดหมาย: เก็บ Network ID ของกลุ่ม, ที่อยู่     */
/*  LAN ของเครื่องเจ้าของห้อง และรายชื่อคนที่เข้ามาในห้อง              */
/* ------------------------------------------------------------------ */

export const LAN_NETWORKS = ["zerotier", "tailscale", "radmin", "other"] as const;
export type LanNetwork = (typeof LAN_NETWORKS)[number];

export const LAN_NETWORK_LABEL: Record<LanNetwork, string> = {
  zerotier: "ZeroTier",
  tailscale: "Tailscale",
  radmin: "Radmin VPN",
  other: "อื่น ๆ / LAN วงเดียวกัน",
};

export const MAX_OPEN_LAN_ROOMS = 2;
const OPEN_TTL_HOURS = 12;
const CLOSED_TTL_HOURS = 72;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function isNetwork(value: unknown): value is LanNetwork {
  return typeof value === "string" && (LAN_NETWORKS as readonly string[]).includes(value);
}

function text(value: unknown, field: string, min: number, max: number): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (s.length < min) throw new ApiError(400, `${field}ต้องมีอย่างน้อย ${min} ตัวอักษร`);
  if (s.length > max) throw new ApiError(400, `${field}ยาวเกินไป (สูงสุด ${max})`);
  return s;
}

function optionalText(value: unknown, max: number): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return null;
  return s.slice(0, max);
}

function lanAddress(value: unknown): string | null {
  const s = optionalText(value, 80);
  if (!s) return null;
  if (!/^[A-Za-z0-9.:[\]_-]+$/.test(s)) {
    throw new ApiError(400, "ที่อยู่ LAN ใช้ได้เฉพาะ IP หรือชื่อเครื่อง (เช่น 10.147.17.5 หรือ 100.101.102.103)");
  }
  return s;
}

function lanPort(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) {
    throw new ApiError(400, "พอร์ตต้องอยู่ระหว่าง 1024–65535");
  }
  return n;
}

export type LanRoomRow = {
  id: number;
  code: string;
  name: string;
  host_id: number;
  network: string;
  network_id: string | null;
  host_address: string | null;
  port: number;
  mc_version: string | null;
  note: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  host_nickname: string;
  host_role: string;
  host_avatar_color: string;
  host_avatar_url: string | null;
};

const ROOM_SELECT = `
SELECT r.id, r.code, r.name, r.host_id, r.network, r.network_id, r.host_address, r.port,
       r.mc_version, r.note, r.status, r.created_at, r.updated_at,
       u.nickname AS host_nickname, u.role AS host_role,
       u.avatar_color AS host_avatar_color, u.avatar_url AS host_avatar_url
  FROM lan_rooms r JOIN users u ON u.id = r.host_id`;

export type LanMemberView = {
  id: number;
  nickname: string;
  avatarColor: string;
  isHost: boolean;
};

export type LanRoomView = {
  id: number;
  code: string;
  name: string;
  network: LanNetwork;
  networkLabel: string;
  networkId: string | null;
  hostAddress: string | null;
  port: number;
  mcVersion: string | null;
  note: string | null;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  isHost: boolean;
  joined: boolean;
  host: { id: number; nickname: string; role: string; avatarColor: string; avatarUrl: string | null };
  members: LanMemberView[];
};

function toView(row: LanRoomRow, memberIds: number[], userId: number): LanRoomView {
  const network = (isNetwork(row.network) ? row.network : "other") as LanNetwork;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    network,
    networkLabel: LAN_NETWORK_LABEL[network],
    networkId: row.network_id,
    hostAddress: row.host_address,
    port: Number(row.port),
    mcVersion: row.mc_version,
    note: row.note,
    status: row.status === "closed" ? "closed" : "open",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isHost: row.host_id === userId,
    joined: row.host_id === userId || memberIds.includes(row.id),
    host: {
      id: row.host_id,
      nickname: row.host_nickname,
      role: row.host_role,
      avatarColor: row.host_avatar_color,
      avatarUrl: row.host_avatar_url,
    },
    members: [],
  };
}

/** ปิดห้องที่ไม่มีใครแตะนาน 12 ชม. และลบห้องที่ปิดเกิน 3 วัน */
async function housekeeping(): Promise<void> {
  const now = Date.now();
  await run(
    "UPDATE lan_rooms SET status = 'closed', updated_at = ? WHERE status = 'open' AND updated_at < ?",
    nowIso(),
    new Date(now - OPEN_TTL_HOURS * 3600000).toISOString(),
  );
  await run(
    "DELETE FROM lan_rooms WHERE status = 'closed' AND updated_at < ?",
    new Date(now - CLOSED_TTL_HOURS * 3600000).toISOString(),
  );
}

export async function lanState(user: { id: number }): Promise<{ rooms: LanRoomView[]; maxOpen: number }> {
  await housekeeping();

  const rows = await all<LanRoomRow>(
    `${ROOM_SELECT}
      WHERE r.status = 'open'
         OR r.host_id = ?
         OR r.id IN (SELECT room_id FROM lan_members WHERE user_id = ?)
      ORDER BY (r.status = 'open') DESC, r.id DESC
      LIMIT 60`,
    user.id,
    user.id,
  );
  if (rows.length === 0) return { rooms: [], maxOpen: MAX_OPEN_LAN_ROOMS };

  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(",");
  const memberRows = await all<{ room_id: number; user_id: number; nickname: string; avatar_color: string }>(
    `SELECT m.room_id, m.user_id, u.nickname, u.avatar_color
       FROM lan_members m JOIN users u ON u.id = m.user_id
      WHERE m.room_id IN (${placeholders})
      ORDER BY m.joined_at ASC`,
    ...ids,
  );

  const membersByRoom = new Map<number, LanMemberView[]>();
  const memberIds = new Map<number, number[]>();
  for (const row of memberRows) {
    const list = membersByRoom.get(row.room_id) ?? [];
    list.push({
      id: row.user_id,
      nickname: row.nickname,
      avatarColor: row.avatar_color,
      isHost: rows.find((r) => r.id === row.room_id)?.host_id === row.user_id,
    });
    membersByRoom.set(row.room_id, list);
    const idList = memberIds.get(row.room_id) ?? [];
    idList.push(row.user_id);
    memberIds.set(row.room_id, idList);
  }

  const rooms = rows.map((row) => {
    const view = toView(row, memberIds.get(row.id) ?? [], user.id);
    view.members = membersByRoom.get(row.id) ?? [];
    return view;
  });

  return { rooms, maxOpen: MAX_OPEN_LAN_ROOMS };
}

export async function loadLanRoom(id: number): Promise<LanRoomRow | null> {
  return one<LanRoomRow>(`${ROOM_SELECT} WHERE r.id = ?`, id);
}

export type LanRoomInput = {
  name?: unknown;
  network?: unknown;
  networkId?: unknown;
  hostAddress?: unknown;
  port?: unknown;
  mcVersion?: unknown;
  note?: unknown;
  status?: unknown;
};

export async function createLanRoom(user: { id: number }, input: LanRoomInput): Promise<{ id: number; code: string }> {
  const name = text(input.name, "ชื่อห้อง", 2, 60);
  const network: LanNetwork = isNetwork(input.network) ? input.network : "zerotier";
  const networkId = optionalText(input.networkId, 64);
  const hostAddress = lanAddress(input.hostAddress);
  const port = input.port === undefined || input.port === null || input.port === "" ? 25565 : lanPort(input.port);
  const mcVersion = optionalText(input.mcVersion, 30);
  const note = optionalText(input.note, 300);

  const open = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM lan_rooms WHERE host_id = ? AND status = 'open'",
    user.id,
  );
  if (Number(open?.n ?? 0) >= MAX_OPEN_LAN_ROOMS) {
    throw new ApiError(429, `คุณเปิดห้องค้างไว้ ${MAX_OPEN_LAN_ROOMS} ห้องแล้ว — ปิดห้องเดิมก่อนสร้างใหม่`);
  }

  const now = nowIso();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomCode();
    const exists = await one<{ id: number }>("SELECT id FROM lan_rooms WHERE code = ?", code);
    if (exists) continue;
    const inserted = await one<{ id: number }>(
      `INSERT INTO lan_rooms (code, name, host_id, network, network_id, host_address, port, mc_version, note, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?) RETURNING id`,
      code,
      name,
      user.id,
      network,
      networkId,
      hostAddress,
      port,
      mcVersion,
      note,
      now,
      now,
    );
    if (!inserted) break;
    await run(
      "INSERT OR IGNORE INTO lan_members (room_id, user_id, joined_at) VALUES (?, ?, ?)",
      inserted.id,
      user.id,
      now,
    );
    void publishLanPulse();
    return { id: Number(inserted.id), code };
  }
  throw new ApiError(500, "สร้างห้อง LAN ไม่สำเร็จ ลองใหม่อีกครั้ง");
}

export async function joinLanRoom(user: { id: number }, id: number): Promise<void> {
  const room = await loadLanRoom(id);
  if (!room) throw new ApiError(404, "ไม่พบห้องนี้");
  if (room.status !== "open") throw new ApiError(409, "ห้องนี้ปิดแล้ว");
  if (room.host_id === user.id) throw new ApiError(400, "คุณเป็นเจ้าของห้องนี้อยู่แล้ว");

  const count = await one<{ n: number }>("SELECT COUNT(*) AS n FROM lan_members WHERE user_id = ?", user.id);
  if (Number(count?.n ?? 0) >= 20) throw new ApiError(429, "คุณอยู่ในห้อง LAN หลายห้องเกินไป — ออกห้องเดิมก่อน");

  const now = nowIso();
  const res = await run(
    "INSERT OR IGNORE INTO lan_members (room_id, user_id, joined_at) VALUES (?, ?, ?)",
    id,
    user.id,
    now,
  );
  if (res.changes === 0) return;
  await run("UPDATE lan_rooms SET updated_at = ? WHERE id = ?", now, id);
  void publishLanPulse();
}

export async function leaveLanRoom(user: { id: number }, id: number): Promise<void> {
  const room = await loadLanRoom(id);
  if (!room) throw new ApiError(404, "ไม่พบห้องนี้");
  if (room.host_id === user.id) throw new ApiError(400, "เจ้าของห้องออกไม่ได้ — ให้ปิดห้องแทน");
  await run("DELETE FROM lan_members WHERE room_id = ? AND user_id = ?", id, user.id);
  await run("UPDATE lan_rooms SET updated_at = ? WHERE id = ?", nowIso(), id);
  void publishLanPulse();
}

export async function updateLanRoom(
  user: { id: number; role: string },
  id: number,
  input: LanRoomInput,
): Promise<void> {
  const room = await loadLanRoom(id);
  if (!room) throw new ApiError(404, "ไม่พบห้องนี้");
  const privileged = user.role === "owner" || user.role === "admin";
  if (room.host_id !== user.id && !privileged) throw new ApiError(403, "แก้ไขได้เฉพาะเจ้าของห้อง");

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    params.push(value);
  };

  if (input.name !== undefined) push("name", text(input.name, "ชื่อห้อง", 2, 60));
  if (input.network !== undefined) {
    if (!isNetwork(input.network)) throw new ApiError(400, "เลือกเครือข่าย VPN ไม่ถูกต้อง");
    push("network", input.network);
  }
  if (input.networkId !== undefined) push("network_id", optionalText(input.networkId, 64));
  if (input.hostAddress !== undefined) push("host_address", lanAddress(input.hostAddress));
  if (input.port !== undefined) push("port", lanPort(input.port));
  if (input.mcVersion !== undefined) push("mc_version", optionalText(input.mcVersion, 30));
  if (input.note !== undefined) push("note", optionalText(input.note, 300));
  if (input.status !== undefined) {
    const status = input.status === "closed" ? "closed" : "open";
    push("status", status);
  }

  if (sets.length === 0) return;
  push("updated_at", nowIso());
  await run(`UPDATE lan_rooms SET ${sets.join(", ")} WHERE id = ?`, ...params, id);
  void publishLanPulse();
}

export async function deleteLanRoom(user: { id: number; role: string }, id: number): Promise<void> {
  const room = await loadLanRoom(id);
  if (!room) throw new ApiError(404, "ไม่พบห้องนี้");
  const privileged = user.role === "owner" || user.role === "admin";
  if (room.host_id !== user.id && !privileged) throw new ApiError(403, "ลบได้เฉพาะเจ้าของห้อง");
  await run("DELETE FROM lan_rooms WHERE id = ?", id);
  void publishLanPulse();
}
