import Link from "next/link";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { levelFromXp } from "@/lib/levels";
import { bkkToday } from "@/lib/attendance";
import { badgeDef } from "@/lib/badges";
import { formatDate, relativeTime } from "@/lib/format";
import { Avatar, Empty, LevelBadge, PageHeader, RoleBadge, TitleBadge } from "@/components/ui";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "สมาชิกในห้อง · SKC105 Room Hub" };

type Row = {
  id: number;
  nickname: string;
  real_name: string;
  role: string;
  avatar_color: string;
  avatar_url: string | null;
  title: string | null;
  xp: number;
  bio: string | null;
  created_at: string;
  last_login_at: string | null;
  messages: number;
  tasks_done: number;
  answers: number;
};

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const params = await searchParams;
  const term = (params.q ?? "").trim();
  const like = `%${term.replace(/[%_]/g, "")}%`;

  const rows = await all<Row>(
    `SELECT u.id, u.nickname, u.real_name, u.role, u.avatar_color, u.avatar_url, u.title, u.xp, u.bio,
            u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) AS messages,
            (SELECT COUNT(*) FROM task_status t WHERE t.user_id = u.id AND t.status = 'done') AS tasks_done,
            (SELECT COUNT(*) FROM qa_answers a WHERE a.user_id = u.id) AS answers
       FROM users u
      WHERE u.status = 'active'
        ${term ? "AND (u.nickname LIKE ? OR u.real_name LIKE ?)" : ""}
      ORDER BY u.xp DESC, u.nickname COLLATE NOCASE
      LIMIT 100`,
    ...(term ? [like, like] : []),
  );

  const month = bkkToday().slice(0, 7);
  const [badgeRows, attendanceRows] = await Promise.all([
    all<{ user_id: number; code: string }>("SELECT user_id, code FROM user_badges ORDER BY id"),
    all<{ user_id: number; present: number }>(
      `SELECT user_id, COUNT(*) AS present FROM attendance
        WHERE date LIKE ? AND status IN ('present','late') GROUP BY user_id`,
      `${month}%`,
    ),
  ]);

  const badgesByUser = new Map<number, string[]>();
  for (const row of badgeRows) {
    const list = badgesByUser.get(Number(row.user_id)) ?? [];
    list.push(row.code);
    badgesByUser.set(Number(row.user_id), list);
  }
  const attendanceByUser = new Map(attendanceRows.map((row) => [Number(row.user_id), Number(row.present)]));

  return (
    <div>
      <PageHeader
        title="สมาชิกในห้อง SKC105"
        description="ทำเนียบสมาชิกทั้งหมด — แต้ม XP ป้ายความสำเร็จ การเข้าเรียนเดือนนี้ และช่องทางติดต่อ"
        icon="users"
      />

      <form action="/members" className="card mb-5 flex flex-wrap items-center gap-2 p-3">
        <span className="text-slate-500">
          <Icon name="search" className="size-4" />
        </span>
        <input
          name="q"
          defaultValue={term}
          placeholder="ค้นหาชื่อเล่นหรือชื่อจริง…"
          className="input min-w-0 flex-1 border-0 bg-transparent focus:ring-0"
        />
        <button className="btn btn-primary btn-sm">ค้นหา</button>
        {term ? (
          <Link href="/members" className="btn btn-ghost btn-sm">
            ล้าง
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <Empty icon="users" title="ไม่พบสมาชิกที่ตรงกับคำค้น" hint="ลองพิมพ์ชื่อเล่นสั้นลง หรือล้างคำค้น" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((member) => {
            const badges = badgesByUser.get(member.id) ?? [];
            return (
              <article key={member.id} id={`member-${member.id}`} className="card card-hover p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={member.nickname} color={member.avatar_color} imageUrl={member.avatar_url} size={46} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-white">{member.nickname}</span>
                      <LevelBadge level={levelFromXp(member.xp)} className="!px-1.5 !py-0 !text-[9px]" />
                    </p>
                    <p className="truncate text-[11px] text-slate-500">{member.real_name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <RoleBadge role={member.role} className="!px-1.5 !py-0 !text-[9px]" />
                      <TitleBadge title={member.title} className="!px-1.5 !py-0 !text-[9px]" />
                    </div>
                  </div>
                </div>

                {member.bio ? <p className="mt-2 line-clamp-2 text-xs text-slate-400 italic">“{member.bio}”</p> : null}

                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white/[0.03] py-1.5">
                    <dt className="text-[10px] text-slate-500">XP</dt>
                    <dd className="text-sm font-semibold text-indigo-200">{member.xp}</dd>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] py-1.5">
                    <dt className="text-[10px] text-slate-500">ข้อความ</dt>
                    <dd className="text-sm font-semibold text-slate-200">{member.messages}</dd>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] py-1.5">
                    <dt className="text-[10px] text-slate-500">มาเรียน({month.slice(5)})</dt>
                    <dd className="text-sm font-semibold text-emerald-300">{attendanceByUser.get(member.id) ?? 0}</dd>
                  </div>
                </dl>

                <div className="mt-2.5 flex flex-wrap items-center gap-1">
                  {badges.length === 0 ? (
                    <span className="text-[10px] text-slate-600">ยังไม่มีป้ายความสำเร็จ</span>
                  ) : (
                    badges.slice(0, 8).map((code) => {
                      const def = badgeDef(code);
                      return def ? (
                        <span
                          key={code}
                          title={`${def.label} — ${def.hint}`}
                          className="rounded-full bg-white/5 px-1.5 py-0.5 text-[11px]"
                        >
                          {def.emoji}
                        </span>
                      ) : null;
                    })
                  )}
                </div>

                <p className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                  <span>เข้าใช้ล่าสุด {relativeTime(member.last_login_at)}</span>
                  <span>สมัคร {formatDate(member.created_at)}</span>
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
