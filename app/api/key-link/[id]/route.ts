import { ApiError, fail, intParam, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { deleteHistoryEntry } from "@/lib/keylink";
import { logAudit } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ลบรายการประวัติของตัวเอง (คีย์ที่เคยได้ยังใช้ได้ตามปกติ) */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const id = intParam((await ctx.params).id, "id");
    const removed = await deleteHistoryEntry(user.id, id);
    if (!removed) throw new ApiError(404, "ไม่พบรายการนี้ในประวัติของคุณ");
    await logAudit(user.id, "keylink.forget", `keylink:${id}`, "ลบรายการประวัติการปลดล็อกของตัวเอง");
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
