import { ApiError, fail, intParam, json, readJson, str } from "@/lib/api";
import { one, run, nowIso } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const postId = intParam((await ctx.params).id, "postId");
    const post = one<{ id: number; user_id: number }>("SELECT id, user_id FROM qa_posts WHERE id = ?", postId);
    if (!post) throw new ApiError(404, "ไม่พบคำถามนี้");

    const body = await readJson<{ action?: string; body?: string; resolved?: boolean }>(req);

    if (body.action === "answer") {
      const text = str(body.body, "คำตอบ", 4000);
      const res = run("INSERT INTO qa_answers (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)", postId, user.id, text, nowIso());
      return json({ ok: true, id: res.lastInsertRowid });
    }

    if (body.action === "resolve") {
      if (post.user_id !== user.id && !canModerate(user.role)) throw new ApiError(403, "ไม่มีสิทธิ์เปลี่ยนสถานะคำถาม");
      run("UPDATE qa_posts SET resolved = ? WHERE id = ?", body.resolved ? 1 : 0, postId);
      return json({ ok: true });
    }

    throw new ApiError(400, "ไม่รู้จักคำสั่งนี้");
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const postId = intParam((await ctx.params).id, "postId");
    const url = new URL(req.url);
    const answerId = Number(url.searchParams.get("answerId") || 0);

    if (answerId) {
      const answer = one<{ user_id: number }>("SELECT user_id FROM qa_answers WHERE id = ? AND post_id = ?", answerId, postId);
      if (!answer) throw new ApiError(404, "ไม่พบคำตอบนี้");
      if (answer.user_id !== user.id && !canModerate(user.role)) throw new ApiError(403, "ไม่มีสิทธิ์ลบคำตอบนี้");
      run("DELETE FROM qa_answers WHERE id = ?", answerId);
      return json({ ok: true });
    }

    const post = one<{ user_id: number; title: string }>("SELECT user_id, title FROM qa_posts WHERE id = ?", postId);
    if (!post) throw new ApiError(404, "ไม่พบคำถามนี้");
    if (post.user_id !== user.id && !canModerate(user.role)) throw new ApiError(403, "ไม่มีสิทธิ์ลบคำถามนี้");
    run("DELETE FROM qa_posts WHERE id = ?", postId);
    logAudit(user.id, "qa.delete", `qa:${postId}`, post.title);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
