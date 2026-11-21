import { randomCode } from "./crypto";
import { all, one, run, nowIso } from "./db";
import { getSetting, logAudit, notifyChannels, setSetting } from "./integrations";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing 0/O/1/I

/** ทุก ๆ 5 คนที่ใช้คีย์สมัครสำเร็จ ระบบจะสร้างคีย์ชุดใหม่ให้อัตโนมัติ */
export const REFILL_EVERY = 5;
export const REFILL_BATCH = 5;
const BASELINE_KEY = "invite_refill_baseline";

export function generateKeyCode(): string {
  return `SKC105-${randomCode(6, ALPHABET)}`;
}

/** Create `count` fresh single-use keys and return their codes. */
export async function createInviteKeys(
  count: number,
  note: string | null,
  createdBy: number | null,
): Promise<string[]> {
  const created: string[] = [];
  const total = Math.min(Math.max(Math.round(count), 1), 100);
  for (let i = 0; i < total; i += 1) {
    let code = generateKeyCode();
    let attempts = 0;
    while ((await one("SELECT id FROM invite_keys WHERE code = ?", code)) && attempts < 10) {
      code = generateKeyCode();
      attempts += 1;
    }
    await run(
      "INSERT INTO invite_keys (code, note, created_by, created_at) VALUES (?, ?, ?, ?)",
      code,
      note,
      createdBy,
      nowIso(),
    );
    created.push(code);
  }
  return created;
}

/** All keys that nobody has used yet, oldest first. */
export async function unusedInviteCodes(): Promise<string[]> {
  const rows = await all<{ code: string }>(
    "SELECT code FROM invite_keys WHERE used_at IS NULL ORDER BY created_at ASC, id ASC",
  );
  return rows.map((row) => row.code);
}

/** Number of people who have ever registered with a room key. */
export async function usedKeyCount(): Promise<number> {
  const row = await one<{ n: number }>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'auth.register'");
  return Number(row?.n ?? 0);
}

/**
 * After every successful key registration, top the pool up once five more
 * people have joined with a key, and post the new codes to the webhooks.
 */
export async function autoRefillInviteKeys(): Promise<string[]> {
  const used = await usedKeyCount();
  const stored = await getSetting(BASELINE_KEY);
  if (stored === null) {
    // First run: remember where we started so old registrations never mass-generate keys.
    await setSetting(BASELINE_KEY, String(used));
    return [];
  }

  const baseline = Number(stored) || 0;
  const rounds = Math.floor((used - baseline) / REFILL_EVERY);
  if (rounds < 1) return [];

  const codes = await createInviteKeys(rounds * REFILL_BATCH, "เติมคีย์อัตโนมัติ (ทุก 5 คนที่ใช้คีย์)", null);
  await setSetting(BASELINE_KEY, String(baseline + rounds * REFILL_EVERY));
  await logAudit(
    null,
    "invite.auto_refill",
    "invite:auto",
    `เติมคีย์อัตโนมัติ ${codes.length} คีย์ หลังมีผู้ใช้คีย์เพิ่ม ${rounds * REFILL_EVERY} คน`,
  );
  await notifyChannels(
    `🔑 คีย์ห้องชุดใหม่ ${codes.length} คีย์ (ใช้ได้คีย์ละ 1 ครั้ง)\n${codes.map((code) => `\`${code}\``).join("\n")}`,
  );
  return codes;
}
