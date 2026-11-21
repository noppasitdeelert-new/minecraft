import { ApiError, fail, json, optionalStr, readJson, str } from "@/lib/api";
import { all, one, run, nowIso } from "@/lib/db";
import { canManage, canModerate, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();

    const rewards = await all<{
      id: number;
      name: string;
      description: string | null;
      cost: number;
      stock: number | null;
      active: number;
      created_at: string;
      redeemed: number;
    }>(
      `SELECT r.id, r.name, r.description, r.cost, r.stock, r.active, r.created_at,
              (SELECT COUNT(*) FROM reward_redemptions x WHERE x.reward_id = r.id AND x.status != 'rejected') AS redeemed
         FROM rewards r ORDER BY r.active DESC, r.cost ASC, r.id ASC`,
    );

    const mine = await all<{
      id: number;
      reward_id: number;
      name: string;
      cost: number;
      status: string;
      created_at: string;
      handled_at: string | null;
    }>(
      `SELECT x.id, x.reward_id, r.name, x.cost, x.status, x.created_at, x.handled_at
         FROM reward_redemptions x JOIN rewards r ON r.id = x.reward_id
        WHERE x.user_id = ? ORDER BY x.id DESC LIMIT 20`,
      user.id,
    );

    const queue = canModerate(user.role)
      ? await all<{ id: number; reward_id: number; name: string; cost: number; created_at: string; nickname: string; avatar_color: string }>(
          `SELECT x.id, x.reward_id, r.name, x.cost, x.created_at, u.nickname, u.avatar_color
             FROM reward_redemptions x
             JOIN rewards r ON r.id = x.reward_id
             JOIN users u ON u.id = x.user_id
            WHERE x.status = 'pending' ORDER BY x.id ASC LIMIT 50`,
        )
      : [];

    const balance = await one<{ xp: number }>("SELECT xp FROM users WHERE id = ?", user.id);

    return json({
      rewards,
      mine,
      queue,
      xp: Number(balance?.xp ?? 0),
      canManage: canManage(user.role),
    });
  } catch (error) {
    return fail(error);
  }
}

/** แอดมินเพิ่มของรางวัลใหม่เข้าร้าน */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManage(user.role)) throw new ApiError(403, "เฉพาะแอดมินเท่านั้น");

    const body = await readJson<{ name?: string; description?: string; cost?: number; stock?: number | null }>(req);
    const name = str(body.name, "ชื่อของรางวัล", 120);
    const description = optionalStr(body.description, 500);
    const cost = Math.max(1, Math.round(Number(body.cost ?? 50)));
    const stockRaw = body.stock === null || body.stock === undefined ? null : Number(body.stock);
    const stock = stockRaw === null || !Number.isFinite(stockRaw) ? null : Math.max(0, Math.round(stockRaw));

    const res = await run(
      "INSERT INTO rewards (name, description, cost, stock, active, created_by, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
      name,
      description,
      cost,
      stock,
      user.id,
      nowIso(),
    );
    await logAudit(user.id, "reward.create", `reward:${res.lastInsertRowid}`, `${name} (${cost} XP)`);
    return json({ ok: true, id: res.lastInsertRowid });
  } catch (error) {
    return fail(error);
  }
}
