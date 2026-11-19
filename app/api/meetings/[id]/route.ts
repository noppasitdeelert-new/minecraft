import { ApiError, fail, intParam, json, optionalStr, readJson, str } from "@/lib/api";
import { all, one, run, nowIso } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MeetingRow = {
  id: number;
  title: string;
  agenda: string | null;
  room_code: string;
  starts_at: string;
  status: string;
  notes: string | null;
  created_at: string;
  created_by: number;
};

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const id = intParam((await ctx.params).id, "meetingId");
    const meeting = one<MeetingRow>("SELECT * FROM meetings WHERE id = ?", id);
    if (!meeting) throw new ApiError(404, "ไม่พบห้องประชุมนี้");

    const after = Number(new URL(req.url).searchParams.get("afterMessage") || 0);

    const participants = all<{
      user_id: number;
      nickname: string;
      role: string;
      avatar_color: string;
      hand_raised: number;
      joined_at: string;
      last_seen: string;
    }>(
      `SELECT p.user_id, u.nickname, u.role, u.avatar_color, p.hand_raised, p.joined_at, p.last_seen
         FROM meeting_participants p JOIN users u ON u.id = p.user_id
        WHERE p.meeting_id = ?
        ORDER BY p.hand_raised DESC, p.joined_at ASC`,
      id,
    );

    const messages = all<{
      id: number;
      body: string;
      created_at: string;
      user_id: number;
      nickname: string;
      role: string;
      avatar_color: string;
    }>(
      `SELECT mm.id, mm.body, mm.created_at, u.id AS user_id, u.nickname, u.role, u.avatar_color
         FROM meeting_messages mm JOIN users u ON u.id = mm.user_id
        WHERE mm.meeting_id = ? AND mm.id > ?
        ORDER BY mm.id ASC LIMIT 200`,
      id,
      after,
    );

    return json({ meeting, participants, messages });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const id = intParam((await ctx.params).id, "meetingId");
    const meeting = one<MeetingRow>("SELECT * FROM meetings WHERE id = ?", id);
    if (!meeting) throw new ApiError(404, "ไม่พบห้องประชุมนี้");

    const body = await readJson<{
      action?: string;
      raised?: boolean;
      status?: string;
      notes?: string;
      body?: string;
    }>(req);

    switch (body.action) {
      case "join": {
        run(
          `INSERT INTO meeting_participants (meeting_id, user_id, hand_raised, joined_at, last_seen)
           VALUES (?, ?, 0, ?, ?)
           ON CONFLICT(meeting_id, user_id) DO UPDATE SET last_seen = excluded.last_seen`,
          id,
          user.id,
          nowIso(),
          nowIso(),
        );
        return json({ ok: true });
      }
      case "leave": {
        run("DELETE FROM meeting_participants WHERE meeting_id = ? AND user_id = ?", id, user.id);
        return json({ ok: true });
      }
      case "hand": {
        const raised = body.raised ? 1 : 0;
        run("UPDATE meeting_participants SET hand_raised = ? WHERE meeting_id = ? AND user_id = ?", raised, id, user.id);
        run(
          `INSERT INTO meeting_participants (meeting_id, user_id, hand_raised, joined_at, last_seen)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(meeting_id, user_id) DO UPDATE SET hand_raised = excluded.hand_raised, last_seen = excluded.last_seen`,
          id,
          user.id,
          raised,
          nowIso(),
          nowIso(),
        );
        return json({ ok: true, raised: Boolean(raised) });
      }
      case "status": {
        if (!canModerate(user.role)) throw new ApiError(403, "ไม่มีสิทธิ์เปลี่ยนสถานะการประชุม");
        const status = String(body.status || "");
        if (!["scheduled", "live", "ended"].includes(status)) throw new ApiError(400, "สถานะไม่ถูกต้อง");
        run("UPDATE meetings SET status = ? WHERE id = ?", status, id);
        logAudit(user.id, "meeting.status", `meeting:${id}`, status);
        return json({ ok: true, status });
      }
      case "notes": {
        const notes = optionalStr(body.notes, 20000) ?? "";
        if (!canModerate(user.role) && meeting.created_by !== user.id)
          throw new ApiError(403, "เฉพาะผู้สร้างหรือแอดมินเท่านั้นที่แก้บันทึกการประชุมได้");
        run("UPDATE meetings SET notes = ? WHERE id = ?", notes, id);
        logAudit(user.id, "meeting.notes", `meeting:${id}`, "อัปเดตบันทึกการประชุม");
        return json({ ok: true, notes });
      }
      case "message": {
        const text = str(body.body, "ข้อความ", 1000);
        const res = run(
          "INSERT INTO meeting_messages (meeting_id, user_id, body, created_at) VALUES (?, ?, ?, ?)",
          id,
          user.id,
          text,
          nowIso(),
        );
        const message = one(
          `SELECT mm.id, mm.body, mm.created_at, u.id AS user_id, u.nickname, u.role, u.avatar_color
             FROM meeting_messages mm JOIN users u ON u.id = mm.user_id WHERE mm.id = ?`,
          res.lastInsertRowid,
        );
        return json({ message });
      }
      default:
        throw new ApiError(400, "ไม่รู้จักคำสั่งนี้");
    }
  } catch (error) {
    return fail(error);
  }
}
