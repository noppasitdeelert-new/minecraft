import { ApiError, fail, intParam, json, readJson, str } from "@/lib/api";
import { one, run, nowIso } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** แก้ไขข้อความของตัวเองได้ภายใน 1 ชั่วโมงหลังส่ง */
const EDIT_WINDOW_MS = 60 * 60 * 1000;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await rateLimit(`message-edit:${user.id}`, 30, 60);

    const messageId = intParam((await ctx.params).id, "messageId");
    const body = await readJson<{ body?: string }>(req);
    const text = str(body.body, "ข้อความ", 2000);

    const row = await one<{ user_id: number; created_at: string }>(
      "SELECT user_id, created_at FROM messages WHERE id = ?",
      messageId,
    );
    if (!row) throw new ApiError(404, "ไม่พบข้อความนี้");
    if (row.user_id !== user.id) throw new ApiError(403, "แก้ไขได้เฉพาะข้อความของตัวเอง");
    if (Date.now() - new Date(row.created_at).getTime() > EDIT_WINDOW_MS) {
      throw new ApiError(400, "แก้ไขได้ภายใน 1 ชั่วโมงหลังส่งเท่านั้น");
    }

    const now = nowIso();
    await run("UPDATE messages SET body = ?, edited_at = ? WHERE id = ?", text, now, messageId);
    return json({ ok: true, body: text, edited_at: now });
  } catch (error) {
    return fail(error);
  }
}
