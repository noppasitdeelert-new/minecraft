import { ApiError } from "./api";
import { all, one, nowIso, run } from "./db";
import { getSetting, logAudit, setSetting } from "./integrations";
import { consumeKeyShare, inspectKeyShare, type KeyShareRow } from "./keyshare";

/**
 * ตัวช่วยลิงก์คีย์ (Key Link Helper)
 *
 * ผู้ใช้เอา "ลิงก์รับคีย์" มาวาง ระบบจะตรวจรูปแบบ/โดเมนให้ก่อน แล้วจึงปลดล็อก:
 * - ลิงก์แชร์คีย์ของเว็บนี้ (/s/<โทเคน>) → ดึงคีย์จริง 1 ใบจากคลังที่ยังไม่ถูกใช้
 * - ลิงก์ภายนอกที่แอดมินอนุญาต → ตรวจสอบเท่านั้น ไม่มีการออกรหัสคีย์
 *
 * ทุกครั้งที่ปลดล็อกจะถูกจำกัดต่อวัน (ตั้งค่าได้ที่ /admin) และบันทึกลง
 * audit_logs พร้อมเก็บประวัติไว้ในบัญชีของผู้ใช้เอง
 */

const KEY_ENABLED = "keylink_enabled";
const KEY_LIMIT = "keylink_daily_limit";
const KEY_DOMAINS = "keylink_domains";

export const KEYLINK_DEFAULT_LIMIT = 3;
export const KEYLINK_MAX_LIMIT = 50;
export const KEYLINK_MAX_DOMAINS = 10;
export const KEYLINK_MAX_URL_LENGTH = 500;

export const KEYLINK_STEP_LABELS = [
  "ตรวจสอบรูปแบบลิงก์",
  "ตรวจโดเมนที่อนุญาต",
  "ยืนยันลิงก์กับเซิร์ฟเวอร์",
  "ดึงคีย์จากคลังห้อง",
  "บันทึกประวัติการใช้งาน",
] as const;

export type KeyLinkConfig = {
  enabled: boolean;
  dailyLimit: number;
  extraDomains: string[];
};

export type KeyLinkJob = {
  id: number;
  user_id: number;
  url: string;
  host: string;
  kind: "share" | "external";
  status: "unlocked" | "validated" | "failed";
  key_code: string | null;
  share_id: number | null;
  detail: string | null;
  created_at: string;
  completed_at: string | null;
};

export type KeyLinkHistoryRow = KeyLinkJob;

/** Domains are stored bare (no scheme, no path, lowercase). */
export function normalizeDomain(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  let host = value;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "");
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(host)) return null;
  return host;
}

export function parseDomains(value: string | null): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  for (const piece of value.split(/[\s,]+/)) {
    const host = normalizeDomain(piece);
    if (host) seen.add(host);
    if (seen.size >= KEYLINK_MAX_DOMAINS) break;
  }
  return [...seen];
}

export async function loadKeyLinkConfig(): Promise<KeyLinkConfig> {
  const [enabled, limit, domains] = await Promise.all([
    getSetting(KEY_ENABLED),
    getSetting(KEY_LIMIT),
    getSetting(KEY_DOMAINS),
  ]);
  const parsed = limit === null ? Number.NaN : Number(limit);
  return {
    enabled: enabled === null ? true : enabled === "1",
    dailyLimit: Number.isFinite(parsed)
      ? Math.min(Math.max(Math.round(parsed), 1), KEYLINK_MAX_LIMIT)
      : KEYLINK_DEFAULT_LIMIT,
    extraDomains: parseDomains(domains),
  };
}

export async function saveKeyLinkConfig(next: {
  enabled: boolean;
  dailyLimit: number;
  domains: string[];
}): Promise<KeyLinkConfig> {
  const dailyLimit = Math.min(Math.max(Math.round(next.dailyLimit) || KEYLINK_DEFAULT_LIMIT, 1), KEYLINK_MAX_LIMIT);
  const domains = parseDomains(next.domains.join(","));
  await Promise.all([
    setSetting(KEY_ENABLED, next.enabled ? "1" : "0"),
    setSetting(KEY_LIMIT, String(dailyLimit)),
    setSetting(KEY_DOMAINS, domains.join(",")),
  ]);
  return { enabled: next.enabled, dailyLimit, extraDomains: domains };
}

export function startOfTodayIso(): string {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
}

export async function dailyUsage(userId: number): Promise<number> {
  const row = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM key_link_jobs WHERE user_id = ? AND created_at >= ?",
    userId,
    startOfTodayIso(),
  );
  return Number(row?.n ?? 0);
}

const JOB_COLUMNS = `id, user_id, url, host, kind, status, key_code, share_id, detail, created_at, completed_at`;

export function listHistory(userId: number, limit = 30): Promise<KeyLinkHistoryRow[]> {
  return all<KeyLinkHistoryRow>(
    `SELECT ${JOB_COLUMNS} FROM key_link_jobs WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    userId,
    Math.min(Math.max(Math.round(limit), 1), 100),
  );
}

export async function deleteHistoryEntry(userId: number, id: number): Promise<boolean> {
  const res = await run("DELETE FROM key_link_jobs WHERE id = ? AND user_id = ?", id, userId);
  return res.changes > 0;
}

export type LinkReason = "empty" | "invalid" | "scheme" | "host" | "path" | "share-missing";

export const LINK_REASON_TEXT: Record<LinkReason, string> = {
  empty: "กรุณาวางลิงก์ก่อนตรวจสอบ",
  invalid: "รูปแบบลิงก์ไม่ถูกต้อง ลองคัดลอกลิงก์แบบเต็มมาวางอีกครั้ง",
  scheme: "รับเฉพาะลิงก์ที่ขึ้นต้นด้วย https:// เท่านั้น",
  host: "โดเมนของลิงก์นี้ไม่อยู่ในรายการที่อนุญาต",
  path: "ลิงก์ของเว็บนี้ต้องเป็นลิงก์แชร์คีย์รูปแบบ /s/<โทเคน>",
  "share-missing": "ไม่พบลิงก์แชร์คีย์นี้ในระบบ (พิมพ์ผิดหรือถูกลบไปแล้ว)",
};

export type LinkPreview =
  | { ok: true; url: string; host: string; kind: "share" | "external"; token: string | null; share: KeyShareRow | null; shareStatus: string | null }
  | { ok: false; reason: LinkReason };

/** ตรวจลิงก์แบบอ่านอย่างเดียว — ไม่กินโควตา ไม่กินจำนวนครั้งของลิงก์แชร์ */
export async function inspectLink(raw: string | null | undefined, siteHost: string): Promise<LinkPreview> {
  const input = (raw || "").trim();
  if (!input) return { ok: false, reason: "empty" };
  if (input.length > KEYLINK_MAX_URL_LENGTH) return { ok: false, reason: "invalid" };

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "scheme" };

  const host = url.hostname.toLowerCase();
  const config = await loadKeyLinkConfig();
  const allowed = new Set([siteHost.toLowerCase(), ...config.extraDomains]);
  if (!allowed.has(host)) return { ok: false, reason: "host" };

  const match = url.pathname.match(/^\/s\/([a-f0-9]{16,64})\/?$/i);
  if (match) {
    const state = await inspectKeyShare(match[1]);
    if (state.status === "missing") return { ok: false, reason: "share-missing" };
    return {
      ok: true,
      url: url.toString(),
      host,
      kind: "share",
      token: match[1],
      share: state.share,
      shareStatus: state.status,
    };
  }

  // ลิงก์ในโดเมนของเว็บเองแต่ไม่ใช่ /s/<token> ถือว่าไม่ถูกต้อง
  if (host === siteHost.toLowerCase()) return { ok: false, reason: "path" };

  return { ok: true, url: url.toString(), host, kind: "external", token: null, share: null, shareStatus: null };
}

export const SHARE_STATUS_TEXT: Record<string, string> = {
  ok: "ลิงก์ใช้งานได้",
  revoked: "ลิงก์นี้ถูกยกเลิกแล้ว",
  expired: "ลิงก์นี้หมดอายุแล้ว",
  "used-up": "ลิงก์นี้ถูกเปิดครบจำนวนแล้ว",
};

/** คีย์ที่ยังไม่ถูกใช้ และยังไม่เคยถูกแจกผ่านตัวช่วยนี้ — กันได้คีย์ซ้ำกันหลายคน */
async function availableCode(): Promise<string | null> {
  const row = await one<{ code: string }>(
    `SELECT code FROM invite_keys
      WHERE used_at IS NULL
        AND code NOT IN (SELECT key_code FROM key_link_jobs WHERE key_code IS NOT NULL)
      ORDER BY created_at ASC, id ASC
      LIMIT 1`,
  );
  return row?.code ?? null;
}

export async function keyPoolState(): Promise<{ available: number; unassigned: number }> {
  const available = await one<{ n: number }>("SELECT COUNT(*) AS n FROM invite_keys WHERE used_at IS NULL");
  const unassigned = await one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM invite_keys
      WHERE used_at IS NULL
        AND code NOT IN (SELECT key_code FROM key_link_jobs WHERE key_code IS NOT NULL)`,
  );
  return { available: Number(available?.n ?? 0), unassigned: Number(unassigned?.n ?? 0) };
}

export type UnlockOutcome = {
  status: "unlocked" | "validated";
  key: string | null;
  job: KeyLinkJob;
  share: KeyShareRow | null;
  message: string;
  remaining: number;
};

export async function unlockLink(options: {
  user: { id: number; nickname: string };
  url: string;
  siteHost: string;
}): Promise<UnlockOutcome> {
  const config = await loadKeyLinkConfig();
  if (!config.enabled) throw new ApiError(403, "ตัวช่วยลิงก์คีย์ถูกปิดโดยแอดมิน");

  const used = await dailyUsage(options.user.id);
  if (used >= config.dailyLimit) {
    throw new ApiError(429, `วันนี้ปลดล็อกครบ ${config.dailyLimit} ครั้งแล้ว กรุณาลองใหม่พรุ่งนี้`);
  }

  const preview = await inspectLink(options.url, options.siteHost);
  if (!preview.ok) throw new ApiError(400, LINK_REASON_TEXT[preview.reason]);

  const now = nowIso();

  if (preview.kind === "external") {
    const inserted = await one<KeyLinkJob>(
      `INSERT INTO key_link_jobs (user_id, url, host, kind, status, detail, created_at, completed_at)
       VALUES (?, ?, ?, 'external', 'validated', ?, ?, ?) RETURNING ${JOB_COLUMNS}`,
      options.user.id,
      preview.url,
      preview.host,
      "ลิงก์ภายนอกที่ได้รับอนุญาต — ตรวจสอบรูปแบบแล้ว",
      now,
      now,
    );
    if (!inserted) throw new ApiError(500, "บันทึกผลการตรวจสอบไม่สำเร็จ");
    await logAudit(
      options.user.id,
      "keylink.validate",
      `keylink:${inserted.id}`,
      `ตรวจลิงก์ภายนอก ${preview.host} (ไม่มีการออกรหัสคีย์)`,
    );
    return {
      status: "validated",
      key: null,
      job: inserted,
      share: null,
      message: "ลิงก์ภายนอกผ่านการตรวจสอบ แต่ระบบออกรหัสคีย์ได้เฉพาะลิงก์แชร์คีย์ของห้องนี้เท่านั้น",
      remaining: Math.max(0, config.dailyLimit - used - 1),
    };
  }

  if (preview.shareStatus !== "ok" || !preview.share) {
    throw new ApiError(400, SHARE_STATUS_TEXT[preview.shareStatus ?? ""] ?? "ลิงก์นี้ใช้งานไม่ได้แล้ว");
  }

  const code = await availableCode();
  if (!code) {
    throw new ApiError(409, "คีย์ในคลังห้องหมดแล้ว — แจ้งแอดมินให้สร้างคีย์ชุดใหม่ก่อน");
  }

  await consumeKeyShare(preview.share.id);
  const inserted = await one<KeyLinkJob>(
    `INSERT INTO key_link_jobs (user_id, url, host, kind, status, key_code, share_id, detail, created_at, completed_at)
     VALUES (?, ?, ?, 'share', 'unlocked', ?, ?, ?, ?, ?) RETURNING ${JOB_COLUMNS}`,
    options.user.id,
    preview.url,
    preview.host,
    code,
    preview.share.id,
    "ปลดล็อกจากลิงก์แชร์คีย์",
    now,
    now,
  );
  if (!inserted) throw new ApiError(500, "บันทึกผลการปลดล็อกไม่สำเร็จ");

  await logAudit(
    options.user.id,
    "keylink.unlock",
    `keylink:${inserted.id}`,
    `ปลดล็อกคีย์จากลิงก์ ${preview.share.label ?? `#${preview.share.id}`} (${preview.host})`,
  );

  return {
    status: "unlocked",
    key: code,
    job: inserted,
    share: preview.share,
    message: "ปลดล็อกสำเร็จ! คัดลอกคีย์ด้านล่างไปสมัครได้เลย (ใช้ได้ 1 ครั้ง)",
    remaining: Math.max(0, config.dailyLimit - used - 1),
  };
}

export async function keyLinkStats(): Promise<{ today: number; total: number; users: number; unlocked: number }> {
  const today = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM key_link_jobs WHERE created_at >= ?",
    startOfTodayIso(),
  );
  const total = await one<{ n: number }>("SELECT COUNT(*) AS n FROM key_link_jobs");
  const users = await one<{ n: number }>("SELECT COUNT(DISTINCT user_id) AS n FROM key_link_jobs");
  const unlocked = await one<{ n: number }>("SELECT COUNT(*) AS n FROM key_link_jobs WHERE status = 'unlocked'");
  return {
    today: Number(today?.n ?? 0),
    total: Number(total?.n ?? 0),
    users: Number(users?.n ?? 0),
    unlocked: Number(unlocked?.n ?? 0),
  };
}

export type KeyLinkAdminRow = {
  id: number;
  nickname: string;
  host: string;
  status: string;
  kind: string;
  created_at: string;
};

export function recentAdminJobs(limit = 20): Promise<KeyLinkAdminRow[]> {
  return all<KeyLinkAdminRow>(
    `SELECT j.id, u.nickname, j.host, j.status, j.kind, j.created_at
       FROM key_link_jobs j JOIN users u ON u.id = j.user_id
      ORDER BY j.id DESC LIMIT ?`,
    Math.min(Math.max(Math.round(limit), 1), 100),
  );
}
