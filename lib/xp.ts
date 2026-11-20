import { all, one, run, nowIso } from "./db";
import { levelFromXp } from "./levels";

/** Add (or subtract) XP and keep an audit trail in xp_log. */
export async function awardXp(
  userId: number,
  amount: number,
  reason: string,
  actorId: number | null = null,
): Promise<{ xp: number; level: number; gained: number } | null> {
  const delta = Math.trunc(Number(amount) || 0);
  if (!delta) return null;

  const row = await one<{ xp: number }>("SELECT xp FROM users WHERE id = ?", userId);
  if (!row) return null;

  const xp = Math.max(0, Number(row.xp ?? 0) + delta);
  await run("UPDATE users SET xp = ? WHERE id = ?", xp, userId);
  await run(
    "INSERT INTO xp_log (user_id, amount, reason, actor_id, created_at) VALUES (?, ?, ?, ?, ?)",
    userId,
    delta,
    reason,
    actorId,
    nowIso(),
  );
  return { xp, level: levelFromXp(xp), gained: delta };
}

/** Award XP only the first time this source is recorded for the member. */
export async function awardXpOnce(
  userId: number,
  amount: number,
  reason: string,
): Promise<{ xp: number; level: number; gained: number } | null> {
  const previous = await one<{ id: number }>("SELECT id FROM xp_log WHERE user_id = ? AND reason = ? LIMIT 1", userId, reason);
  if (previous) return null;
  return awardXp(userId, amount, reason);
}

export async function grantedTitles(userId: number): Promise<string[]> {
  const rows = await all<{ label: string }>(
    "SELECT label FROM user_titles WHERE user_id = ? ORDER BY created_at",
    userId,
  );
  return rows.map((r) => r.label);
}
