import { ApiError, fail, intParam, json, readJson } from "@/lib/api";
import { one, run, nowIso } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const pollId = intParam((await ctx.params).id, "pollId");
    const poll = one<{ id: number; status: string; question: string; created_by: number }>(
      "SELECT id, status, question, created_by FROM polls WHERE id = ?",
      pollId,
    );
    if (!poll) throw new ApiError(404, "ไม่พบโพลนี้");

    const body = await readJson<{ action?: string; option_id?: number }>(req);

    if (body.action === "vote") {
      if (poll.status !== "open") throw new ApiError(400, "โพลนี้ปิดรับเสียงแล้ว");
      const optionId = Number(body.option_id);
      const option = one<{ id: number }>("SELECT id FROM poll_options WHERE id = ? AND poll_id = ?", optionId, pollId);
      if (!option) throw new ApiError(400, "ไม่พบตัวเลือกนี้");

      const existing = one<{ id: number }>("SELECT id FROM poll_votes WHERE poll_id = ? AND user_id = ?", pollId, user.id);
      if (existing) throw new ApiError(409, "คุณโหวตโพลนี้ไปแล้ว (1 บัญชีโหวตได้ 1 ครั้ง)");

      run("INSERT INTO poll_votes (poll_id, option_id, user_id, created_at) VALUES (?, ?, ?, ?)", pollId, optionId, user.id, nowIso());
      return json({ ok: true });
    }

    if (body.action === "close" || body.action === "reopen") {
      if (!canModerate(user.role) && poll.created_by !== user.id) throw new ApiError(403, "ไม่มีสิทธิ์เปลี่ยนสถานะโพล");
      const status = body.action === "close" ? "closed" : "open";
      run("UPDATE polls SET status = ? WHERE id = ?", status, pollId);
      logAudit(user.id, "poll.status", `poll:${pollId}`, status);
      return json({ ok: true, status });
    }

    throw new ApiError(400, "ไม่รู้จักคำสั่งนี้");
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const pollId = intParam((await ctx.params).id, "pollId");
    const poll = one<{ created_by: number; question: string }>("SELECT created_by, question FROM polls WHERE id = ?", pollId);
    if (!poll) throw new ApiError(404, "ไม่พบโพลนี้");
    if (poll.created_by !== user.id && !canModerate(user.role)) throw new ApiError(403, "ไม่มีสิทธิ์ลบโพลนี้");
    run("DELETE FROM polls WHERE id = ?", pollId);
    logAudit(user.id, "poll.delete", `poll:${pollId}`, poll.question);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
