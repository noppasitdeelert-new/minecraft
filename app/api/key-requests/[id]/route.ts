import { ApiError, fail, intParam, json, readJson } from "@/lib/api";
import { one, run, nowIso } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import { createInviteKeys } from "@/lib/keys";
import { logAudit, notifyChannels } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** อนุมัติ = ออกคีย์จริง 1 ใบให้ผู้ขอ (คีย์ถูกเก็บในคำขอนั้น) · ไม่อนุมัติ = ปิดคำขอ */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!canModerate(user.role)) throw new ApiError(403, "เฉพาะผู้ดูแลขึ้นไปเท่านั้น");

    const id = intParam((await ctx.params).id, "id");
    const body = await readJson<{ action?: string }>(req);
    const action = String(body.action || "");

    const request = await one<{ id: number; user_id: number; status: string; nickname: string }>(
      `SELECT r.id, r.user_id, r.status, u.nickname
         FROM key_requests r JOIN users u ON u.id = r.user_id
        WHERE r.id = ?`,
      id,
    );
    if (!request) throw new ApiError(404, "ไม่พบคำขอนี้");
    if (request.status !== "pending") throw new ApiError(400, "คำขอนี้ถูกจัดการไปแล้ว");

    const now = nowIso();

    if (action === "approve") {
      const [code] = await createInviteKeys(1, `คำขอคีย์ของ ${request.nickname}`, user.id);
      await run(
        "UPDATE key_requests SET status = 'approved', code = ?, handled_by = ?, handled_at = ? WHERE id = ?",
        code,
        user.id,
        now,
        id,
      );
      await logAudit(user.id, "keyrequest.approve", `keyrequest:${id}`, `ออกคีย์ให้ ${request.nickname}`);
      void notifyChannels(`🔑 อนุมัติคำขอคีย์ของ ${request.nickname} แล้ว`);
      return json({ ok: true, status: "approved", code });
    }

    if (action === "deny") {
      await run(
        "UPDATE key_requests SET status = 'denied', handled_by = ?, handled_at = ? WHERE id = ?",
        user.id,
        now,
        id,
      );
      await logAudit(user.id, "keyrequest.deny", `keyrequest:${id}`, `ปฏิเสธคำขอของ ${request.nickname}`);
      return json({ ok: true, status: "denied", code: null });
    }

    throw new ApiError(400, "ต้องระบุ action = approve หรือ deny");
  } catch (error) {
    return fail(error);
  }
}
