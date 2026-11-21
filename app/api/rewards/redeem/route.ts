import { ApiError, fail, json, readJson } from "@/lib/api";
import { one, run, nowIso } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { awardXp } from "@/lib/xp";
import { logAudit, notifyChannels } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    await rateLimit(`reward-redeem:${user.id}`, 10, 60);

    const body = await readJson<{ rewardId?: number }>(req);
    const rewardId = Number(body.rewardId);
    if (!Number.isInteger(rewardId) || rewardId <= 0) throw new ApiError(400, "ไม่พบของรางวัล");

    const reward = await one<{ id: number; name: string; cost: number; stock: number | null; active: number }>(
      "SELECT id, name, cost, stock, active FROM rewards WHERE id = ?",
      rewardId,
    );
    if (!reward) throw new ApiError(404, "ไม่พบของรางวัลนี้");
    if (!reward.active) throw new ApiError(400, "ของรางวัลนี้ปิดรับแลกแล้ว");

    const redeemedRow = await one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM reward_redemptions WHERE reward_id = ? AND status != 'rejected'",
      rewardId,
    );
    if (reward.stock !== null && Number(redeemedRow?.n ?? 0) >= Number(reward.stock)) {
      throw new ApiError(400, "ของรางวัลนี้ถูกแลกหมดแล้ว");
    }

    const balance = await one<{ xp: number }>("SELECT xp FROM users WHERE id = ?", user.id);
    if (Number(balance?.xp ?? 0) < Number(reward.cost)) {
      throw new ApiError(400, `XP ไม่พอ — ต้องใช้ ${reward.cost} XP (คุณมี ${Number(balance?.xp ?? 0)})`);
    }

    const spent = await awardXp(user.id, -Number(reward.cost), "shop.redeem");
    const res = await run(
      "INSERT INTO reward_redemptions (reward_id, user_id, cost, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
      rewardId,
      user.id,
      reward.cost,
      nowIso(),
    );

    await logAudit(user.id, "reward.redeem", `reward:${rewardId}`, `${reward.name} (${reward.cost} XP)`);
    void notifyChannels(`🎁 ${user.nickname} แลก "${reward.name}" ด้วย ${reward.cost} XP — รอแอดมินมอบให้`);

    return json({ ok: true, id: res.lastInsertRowid, xp: spent?.xp ?? 0 });
  } catch (error) {
    return fail(error);
  }
}
