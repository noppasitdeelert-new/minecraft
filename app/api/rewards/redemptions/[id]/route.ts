import { ApiError, fail, intParam, json, readJson } from "@/lib/api";
import { one, run, nowIso } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import { awardXp } from "@/lib/xp";
import { logAudit } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ผู้ดูแลกด "มอบแล้ว" หรือ "ปฏิเสธ" (ปฏิเสธ = คืน XP ให้สมาชิก) */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!canModerate(user.role)) throw new ApiError(403, "เฉพาะผู้ดูแลขึ้นไปเท่านั้น");

    const id = intParam((await ctx.params).id, "id");
    const body = await readJson<{ action?: string }>(req);
    const action = String(body.action || "");

    const row = await one<{ id: number; user_id: number; cost: number; status: string; name: string }>(
      `SELECT x.id, x.user_id, x.cost, x.status, r.name
         FROM reward_redemptions x JOIN rewards r ON r.id = x.reward_id
        WHERE x.id = ?`,
      id,
    );
    if (!row) throw new ApiError(404, "ไม่พบรายการแลกนี้");
    if (row.status !== "pending") throw new ApiError(400, "รายการนี้ถูกจัดการแล้ว");

    const now = nowIso();

    if (action === "fulfill") {
      await run(
        "UPDATE reward_redemptions SET status = 'fulfilled', handled_by = ?, handled_at = ? WHERE id = ?",
        user.id,
        now,
        id,
      );
      await logAudit(user.id, "reward.fulfill", `redemption:${id}`, row.name);
      return json({ ok: true, status: "fulfilled" });
    }

    if (action === "reject") {
      await run(
        "UPDATE reward_redemptions SET status = 'rejected', handled_by = ?, handled_at = ? WHERE id = ?",
        user.id,
        now,
        id,
      );
      await awardXp(row.user_id, Number(row.cost), "shop.refund");
      await logAudit(user.id, "reward.reject", `redemption:${id}`, `คืน ${row.cost} XP · ${row.name}`);
      return json({ ok: true, status: "rejected", refunded: Number(row.cost) });
    }

    throw new ApiError(400, "ต้องระบุ action = fulfill หรือ reject");
  } catch (error) {
    return fail(error);
  }
}
