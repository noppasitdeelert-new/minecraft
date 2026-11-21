import { ApiError, fail, intParam, json } from "@/lib/api";
import { requireUser, canManage } from "@/lib/auth";
import { deleteKeyShare, revokeKeyShare } from "@/lib/keyshare";
import { logAudit } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ยกเลิกลิงก์ (revoked) — ถ้า purge=1 จะลบทิ้งถาวร */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!canManage(user.role)) throw new ApiError(403, "เฉพาะแอดมินเท่านั้น");

    const id = intParam((await ctx.params).id, "id");
    const purge = new URL(req.url).searchParams.get("purge") === "1";

    if (purge) {
      await deleteKeyShare(id);
      await logAudit(user.id, "keyshare.delete", `keyshare:${id}`, "ลบลิงก์แชร์คีย์ถาวร");
    } else {
      const revoked = await revokeKeyShare(id);
      if (!revoked) throw new ApiError(404, "ไม่พบลิงก์นี้หรือถูกยกเลิกแล้ว");
      await logAudit(user.id, "keyshare.revoke", `keyshare:${id}`, "ยกเลิกลิงก์แชร์คีย์");
    }

    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
