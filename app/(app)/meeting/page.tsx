import { all } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import type { Meeting } from "@/lib/types";
import MeetingClient from "@/components/MeetingClient";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  title: string;
  agenda: string | null;
  room_code: string;
  starts_at: string;
  status: Meeting["status"];
  notes: string | null;
  created_at: string;
  host_id: number;
  nickname: string;
  real_name: string;
  role: Meeting["host"]["role"];
  avatar_color: string;
  participant_count: number;
};

export default async function MeetingPage() {
  const user = await requireUser();

  const rows = all<Row>(
    `SELECT m.id, m.title, m.agenda, m.room_code, m.starts_at, m.status, m.notes, m.created_at,
            u.id AS host_id, u.nickname, u.real_name, u.role, u.avatar_color,
            (SELECT COUNT(*) FROM meeting_participants p WHERE p.meeting_id = m.id) AS participant_count
       FROM meetings m JOIN users u ON u.id = m.created_by
      ORDER BY (m.status = 'ended') ASC, m.starts_at DESC
      LIMIT 30`,
  );

  const meetings: Meeting[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    agenda: r.agenda,
    room_code: r.room_code,
    starts_at: r.starts_at,
    status: r.status,
    notes: r.notes,
    created_at: r.created_at,
    participant_count: r.participant_count,
    host: {
      id: r.host_id,
      nickname: r.nickname,
      real_name: r.real_name,
      role: r.role,
      avatar_color: r.avatar_color,
    },
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="ห้องประชุมออนไลน์"
        description="ประชุมด้วยเสียงและวิดีโอ ยกมือขอพูด แชตระหว่างประชุม และบันทึกสรุปผลร่วมกัน"
        icon="video"
      />
      <MeetingClient
        meetings={meetings}
        me={{ id: user.id, nickname: user.nickname, role: user.role, avatar_color: user.avatar_color }}
        canCreate={canModerate(user.role)}
        jitsiDomain={process.env.JITSI_DOMAIN || "meet.jit.si"}
      />
    </div>
  );
}
