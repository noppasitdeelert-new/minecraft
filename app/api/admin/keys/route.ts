import { ApiError, fail, json, optionalStr, readJson } from "@/lib/api";
import { all, one, run } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { logAudit, notifyChannels } from "@/lib/integrations";
import { createInviteKeys, unusedInviteCodes, usedKeyCount } from "@/lib/keys";
import type { InviteKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireManager();
    const keys = await all<InviteKey>(
      `SELECT k.id, k.code, k.note, k.created_at, k.used_at,
              ub.nickname AS used_by_nickname, cb.nickname AS creator_nickname
         FROM invite_keys k
         LEFT JOIN users ub ON ub.id = k.used_by
         LEFT JOIN users cb ON cb.id = k.created_by
        ORDER BY (k.used_at IS NOT NULL) ASC, k.created_at DESC`,
    );

    return json({
      keys,
      stats: {
        available: keys.filter((k) => !k.used_at).length,
        used: await usedKeyCount(),
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireManager();
    const body = await readJson<{ note?: string; count?: number }>(req);
    const count = Math.min(Math.max(Number(body.count ?? 1), 1), 20);
    const note = optionalStr(body.note, 200);

    const created = await createInviteKeys(count, note, admin.id);

    await logAudit(admin.id, "invite.create", `invite:${created.join(",")}`, `สร้างคีย์ห้อง ${created.length} คีย์`);
    return json({ ok: true, codes: created });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await requireManager();
    const id = Number(new URL(req.url).searchParams.get("id") || 0);
    const key = await one<{ code: string; used_at: string | null }>("SELECT code, used_at FROM invite_keys WHERE id = ?", id);
    if (!key) throw new ApiError(404, "ไม่พบคีย์นี้");
    await run("DELETE FROM invite_keys WHERE id = ?", id);
    await logAudit(admin.id, "invite.delete", `invite:${key.code}`, key.used_at ? "ลบคีย์ที่ใช้แล้ว" : "ลบคีย์ที่ยังไม่ถูกใช้");
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

/**
 * Send every unused key to Discord/LINE in one go (used by the
 * "ส่งคีย์ทั้งหมดที่ยังไม่ถูกใช้" button in /admin).
 */
export async function PATCH() {
  try {
    const admin = await requireManager();
    const codes = await unusedInviteCodes();
    if (codes.length === 0) throw new ApiError(404, "ยังไม่มีคีย์ที่ว่างใช้งาน — กดสร้างคีย์เชิญก่อน");

    const CHUNK = 20;
    for (let i = 0; i < codes.length; i += CHUNK) {
      const slice = codes.slice(i, i + CHUNK);
      await notifyChannels(
        `🔑 คีย์เข้าห้อง SKC105 ทั้งหมด ${codes.length} คีย์ (ใช้ได้คีย์ละ 1 ครั้ง)\n${slice
          .map((code) => `\`${code}\``)
          .join("\n")}\nสร้างโดย ${admin.nickname}`,
      );
    }

    await logAudit(admin.id, "invite.send", "invite:all", `ส่งคีย์ที่ยังไม่ถูกใช้ทั้งหมด ${codes.length} คีย์`);
    return json({ ok: true, codes, sent: codes.length });
  } catch (error) {
    return fail(error);
  }
}
