import { ApiError } from "./api";
import { one, run } from "./db";

/**
 * Fixed-window limiter ที่เก็บใน D1 — ใช้กันการยิงรัว ๆ (เดารหัสผ่าน, สแปม,
 * เปิดลิงก์คีย์ถี่เกินไป) โดยไม่ต้องพึ่ง KV หรือหน่วยความจำของ isolate
 * ซึ่งหายไปทุกครั้งที่ worker ถูก recycle
 */
export function clientIp(req: Request): string {
  const headers = req.headers;
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

export async function rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<void> {
  const key = bucket.slice(0, 150);
  const now = Date.now();
  const row = await one<{ hits: number; reset_at: string }>(
    "SELECT hits, reset_at FROM rate_limits WHERE bucket = ?",
    key,
  );

  const resetAt = row ? new Date(row.reset_at).getTime() : 0;
  if (!row || !Number.isFinite(resetAt) || resetAt <= now) {
    await run(
      "INSERT INTO rate_limits (bucket, hits, reset_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET hits = 1, reset_at = excluded.reset_at",
      key,
      new Date(now + windowSeconds * 1000).toISOString(),
    );
    return;
  }

  if (Number(row.hits) >= limit) {
    const wait = Math.max(1, Math.ceil((resetAt - now) / 1000));
    throw new ApiError(429, `ทำรายการถี่เกินไป กรุณารออีก ${wait} วินาทีแล้วลองใหม่`);
  }

  await run("UPDATE rate_limits SET hits = hits + 1 WHERE bucket = ?", key);
}

/** ล้าง bucket ที่หมดอายุแล้ว — เรียกเป็นครั้งคราวจากหน้าแอดมิน/สุขภาพระบบ */
export async function pruneRateLimits(): Promise<number> {
  const res = await run("DELETE FROM rate_limits WHERE reset_at < ?", new Date().toISOString());
  return res.changes;
}
