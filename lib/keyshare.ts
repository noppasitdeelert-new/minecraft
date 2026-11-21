import { randomHex } from "./crypto";
import { all, one, run, nowIso } from "./db";

/**
 * ลิงก์แชร์คีย์ห้องแบบมีโทเคน
 *
 * ผู้ใช้ขอ "ลิงก์ที่เปิดแล้วเห็นคีย์ได้" — ทำเป็น token สุ่ม 48 hex ที่เดาไม่ได้
 * จำกัดจำนวนครั้งที่เปิด + วันหมดอายุ + เพิกถอนได้ทันที ทุกครั้งที่เปิดจะถูก
 * บันทึกเวลาและนับจำนวนครั้ง แทนการเปิด endpoint ที่ใครก็เข้าถึงคีย์ได้
 */
export const SHARE_DEFAULT_DAYS = 7;
export const SHARE_MAX_DAYS = 30;
export const SHARE_MAX_USES_CAP = 200;

export type KeyShareRow = {
  id: number;
  token: string;
  label: string | null;
  max_uses: number;
  uses: number;
  expires_at: string;
  revoked_at: string | null;
  created_by: number | null;
  created_at: string;
  last_viewed_at: string | null;
  creator_nickname: string | null;
};

const SELECT = `SELECT s.id, s.token, s.label, s.max_uses, s.uses, s.expires_at, s.revoked_at,
                       s.created_by, s.created_at, s.last_viewed_at, u.nickname AS creator_nickname
                  FROM key_shares s LEFT JOIN users u ON u.id = s.created_by`;

export function listKeyShares(): Promise<KeyShareRow[]> {
  return all<KeyShareRow>(`${SELECT} ORDER BY s.id DESC LIMIT 50`);
}

export async function createKeyShare(options: {
  label: string | null;
  days: number;
  maxUses: number;
  createdBy: number | null;
}): Promise<KeyShareRow> {
  const days = Math.min(Math.max(Math.round(options.days) || SHARE_DEFAULT_DAYS, 1), SHARE_MAX_DAYS);
  const maxUses = Math.min(Math.max(Math.round(options.maxUses) || 10, 1), SHARE_MAX_USES_CAP);
  const token = randomHex(24);
  const created = nowIso();
  const expires = new Date(Date.now() + days * 86400000).toISOString();

  const res = await run(
    "INSERT INTO key_shares (token, label, max_uses, uses, expires_at, created_by, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)",
    token,
    options.label,
    maxUses,
    expires,
    options.createdBy,
    created,
  );

  const row = await one<KeyShareRow>(`${SELECT} WHERE s.id = ?`, res.lastInsertRowid);
  if (!row) throw new Error("สร้างลิงก์แชร์คีย์ไม่สำเร็จ");
  return row;
}

export type ShareState =
  | { status: "ok"; share: KeyShareRow }
  | { status: "missing" | "revoked" | "expired" | "used-up"; share: KeyShareRow | null };

/** ตรวจสถานะลิงก์ก่อนแสดงคีย์ — ไม่แตะตัวนับ */
export async function inspectKeyShare(token: string): Promise<ShareState> {
  if (!/^[a-f0-9]{16,64}$/i.test(token)) return { status: "missing", share: null };
  const share = await one<KeyShareRow>(`${SELECT} WHERE s.token = ?`, token);
  if (!share) return { status: "missing", share: null };
  if (share.revoked_at) return { status: "revoked", share };
  if (new Date(share.expires_at).getTime() <= Date.now()) return { status: "expired", share };
  if (Number(share.uses) >= Number(share.max_uses)) return { status: "used-up", share };
  return { status: "ok", share };
}

/** นับหนึ่งครั้งที่เปิดลิงก์ (เรียกหลังตรวจสถานะผ่านแล้วเท่านั้น) */
export async function consumeKeyShare(id: number): Promise<void> {
  await run("UPDATE key_shares SET uses = uses + 1, last_viewed_at = ? WHERE id = ?", nowIso(), id);
}

export async function revokeKeyShare(id: number): Promise<boolean> {
  const res = await run("UPDATE key_shares SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", nowIso(), id);
  return res.changes > 0;
}

/** ลิงก์แบบเต็มสำหรับส่งให้เพื่อน — ต้องมาจาก origin ของ request เท่านั้น */
export function shareLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/s/${token}`;
}

export async function deleteKeyShare(id: number): Promise<void> {
  await run("DELETE FROM key_shares WHERE id = ?", id);
}
