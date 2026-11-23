import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ApiError } from "./api";

/* ------------------------------------------------------------------ */
/*  Freebuff Sites realtime (WebSocket) — ฝั่งเซิร์ฟเวอร์               */
/*                                                                    */
/*  ตัวช่วย Worker `freebuff-realtime/` รับ request 2 แบบจาก binding:  */
/*    POST /ticket  → ออกตั๋วใช้ครั้งเดียวสำหรับเปิด WebSocket          */
/*    POST /publish → ยิง event ที่เชื่อถือได้ไปยังทุกคนในห้อง          */
/*  client ไม่มีสิทธิ์ publish (publish: false) จึงปลอมผลเกมไม่ได้     */
/* ------------------------------------------------------------------ */

type RealtimeStub = { fetch(request: Request): Promise<Response> };
type RealtimeBinding = { idFromName(name: string): unknown; get(id: unknown): RealtimeStub };

type RealtimeEnv = { REALTIME?: RealtimeBinding; APP_ORIGIN?: string };

export const LOBBY_ROOM = "games:lobby";
export const LAN_ROOM = "lan:lobby";

export function gameRoomName(roomId: number): string {
  return `game:${roomId}`;
}

async function realtimeEnv(): Promise<RealtimeEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as RealtimeEnv;
}

async function call(binding: RealtimeBinding, path: string, body: unknown): Promise<Response> {
  return binding.get(binding.idFromName("hub")).fetch(
    new Request(`https://realtime${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** โดเมนจริงของเว็บ (ใช้ตรวจ origin ของตั๋ว — ไม่เชื่อ Host header) */
export async function siteOrigin(req: Request): Promise<string> {
  try {
    const env = await realtimeEnv();
    if (typeof env.APP_ORIGIN === "string" && env.APP_ORIGIN) return env.APP_ORIGIN.replace(/\/+$/, "");
  } catch {
    // ไม่มี binding (เช่น dev บางโหมด) → ใช้ origin ของคำขอ
  }
  return new URL(req.url).origin;
}

export type RealtimeTicket = { ticket: string; expiresAt: number; websocketUrl: string };

/** ออกตั๋วให้ client เปิด WebSocket ได้ (ต้องตรวจสิทธิ์ก่อนเรียกเสมอ) */
export async function createRealtimeTicket(
  room: string,
  userId: string,
  origin: string,
): Promise<RealtimeTicket> {
  let env: RealtimeEnv;
  try {
    env = await realtimeEnv();
  } catch {
    throw new ApiError(503, "ยังไม่เปิดใช้การอัปเดตเรียลไทม์ในเครื่องนี้");
  }
  if (!env.REALTIME) throw new ApiError(503, "ยังไม่เปิดใช้การอัปเดตเรียลไทม์ในเครื่องนี้");

  const res = await call(env.REALTIME, "/ticket", {
    room,
    userId,
    origin,
    publish: false,
    presence: true,
  });
  if (!res.ok) throw new ApiError(503, "ขอสิทธิ์เชื่อมต่อเรียลไทม์ไม่สำเร็จ");
  return (await res.json()) as RealtimeTicket;
}

/**
 * ยิง event หลังบันทึกฐานข้อมูลสำเร็จแล้วเท่านั้น
 * ถ้า realtime ปิด/ล่ม ต้องไม่ทำให้การเดินหมากหรือแชตของผู้เล่นล้มเหลว
 */
export async function publishRealtime(
  room: string,
  event: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  try {
    const env = await realtimeEnv();
    if (!env.REALTIME) return;
    const res = await call(env.REALTIME, "/publish", { room, event, data });
    if (!res.ok) console.error("[realtime] publish rejected", room, event, res.status);
  } catch (error) {
    console.error("[realtime] publish failed", room, event, error);
  }
}

export type RoomPulse = {
  status?: string;
  moveCount?: number;
  turnSeat?: number;
  winnerSeat?: number | null;
  result?: string | null;
  resultNote?: string | null;
};

/** แจ้งทุกคนในห้องว่ากระดาน/สถานะเปลี่ยน — client จะดึง snapshot ใหม่ทันที */
export async function publishRoomPulse(roomId: number, pulse: RoomPulse = {}): Promise<void> {
  await publishRealtime(gameRoomName(roomId), "room", pulse);
}

/** แจ้งล็อบบี้เมื่อมีห้องใหม่/มีคน join/ห้องจบ */
export async function publishLobbyPulse(): Promise<void> {
  await publishRealtime(LOBBY_ROOM, "lobby", {});
}

/** แจ้งทุกคนในหน้าศูนย์นัดเล่น LAN ว่ามีห้องใหม่/มีคน join/ข้อมูลห้องเปลี่ยน */
export async function publishLanPulse(): Promise<void> {
  await publishRealtime(LAN_ROOM, "lan", {});
}
