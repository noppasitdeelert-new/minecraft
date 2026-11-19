import crypto from "node:crypto";
import { ApiError, fail, json, optionalStr, readJson, str } from "@/lib/api";
import { all, run, nowIso, one } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import { logAudit, notifyChannels } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const meetings = all<{
      id: number;
      title: string;
      agenda: string | null;
      room_code: string;
      starts_at: string;
      status: string;
      notes: string | null;
      created_at: string;
      host_id: number;
      nickname: string;
      real_name: string;
      role: string;
      avatar_color: string;
      participant_count: number;
      hand_count: number;
    }>(
      `SELECT m.id, m.title, m.agenda, m.room_code, m.starts_at, m.status, m.notes, m.created_at,
              u.id AS host_id, u.nickname, u.real_name, u.role, u.avatar_color,
              (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = m.id) AS participant_count,
              (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = m.id AND p.hand_raised = 1) AS hand_count
         FROM meetings m JOIN users u ON u.id = m.created_by
        ORDER BY (m.status = 'ended') ASC, m.starts_at DESC
        LIMIT 30`,
    );
    return json({ meetings });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ title?: string; agenda?: string; starts_at?: string }>(req);

    if (!canModerate(user.role)) throw new ApiError(403, "เฉพาะแอดมินหรือผู้ดูแลเท่านั้นที่สร้างห้องประชุมได้");
    const title = str(body.title, "หัวข้อประชุม", 140);
    const agenda = optionalStr(body.agenda, 2000);
    const startsRaw = optionalStr(body.starts_at, 40);
    const startsAt = startsRaw ? new Date(startsRaw) : new Date();
    if (Number.isNaN(startsAt.getTime())) throw new ApiError(400, "วันเวลาประชุมไม่ถูกต้อง");

    const roomCode = `skc105-${crypto.randomBytes(4).toString("hex")}`;
    const res = run(
      "INSERT INTO meetings (title, agenda, room_code, starts_at, status, created_by, created_at) VALUES (?, ?, ?, ?, 'scheduled', ?, ?)",
      title,
      agenda,
      roomCode,
      startsAt.toISOString(),
      user.id,
      nowIso(),
    );

    logAudit(user.id, "meeting.create", `meeting:${res.lastInsertRowid}`, title);
    void notifyChannels(`🎥 เปิดห้องประชุมใหม่: **${title}** โดย ${user.nickname}`);
    const created = one("SELECT * FROM meetings WHERE id = ?", res.lastInsertRowid);
    return json({ meeting: created });
  } catch (error) {
    return fail(error);
  }
}
