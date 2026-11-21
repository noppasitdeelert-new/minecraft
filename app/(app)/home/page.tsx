import Link from "next/link";
import { all, one } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import {
  formatDateShort,
  formatDateTime,
  formatClockTime,
  dueLabel,
  currentWeekday,
  weekdayName,
  todayBangkok,
  relativeTime,
} from "@/lib/format";
import { ATTENDANCE_LABEL, DAY_LABEL, ROLE_LABEL } from "@/lib/labels";
import { levelFromXp } from "@/lib/levels";
import AttendanceWidget from "@/components/AttendanceWidget";
import AnnouncementBoard from "@/components/AnnouncementBoard";
import { Avatar, Empty, LevelBadge, SectionCard, Stat, TitleBadge } from "@/components/ui";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const dow = currentWeekday();

  const [tasks, todayClasses, todayDuty, counts, nextMeeting, attendance, leaderboard] = await Promise.all([
    all<{
      id: number;
      subject: string;
      title: string;
      due_date: string | null;
      my_status: string | null;
      done_count: number;
      total_members: number;
    }>(
      `SELECT t.id, t.subject, t.title, t.due_date, ts.status AS my_status,
              (SELECT COUNT(*) FROM task_status x WHERE x.task_id = t.id AND x.status = 'done') AS done_count,
              (SELECT COUNT(*) FROM users WHERE status = 'active') AS total_members
         FROM tasks t
         LEFT JOIN task_status ts ON ts.task_id = t.id AND ts.user_id = ?
        ORDER BY (ts.status = 'done') ASC, COALESCE(t.due_date, '9999-12-31') ASC
        LIMIT 4`,
      user.id,
    ),
    all<{
      id: number;
      title: string;
      subject: string | null;
      start_time: string | null;
      end_time: string | null;
      location: string | null;
    }>(
      "SELECT id, title, subject, start_time, end_time, location FROM schedule_entries WHERE kind = 'class' AND day_of_week = ? ORDER BY start_time",
      dow,
    ),
    one<{ title: string }>(
      "SELECT title FROM schedule_entries WHERE kind = 'duty' AND day_of_week = ? LIMIT 1",
      dow,
    ),
    one<{
      members: number;
      open_polls: number;
      open_tasks: number;
      messages: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE status = 'active') AS members,
         (SELECT COUNT(*) FROM polls WHERE status = 'open') AS open_polls,
         (SELECT COUNT(*) FROM tasks) AS open_tasks,
         (SELECT COUNT(*) FROM messages) AS messages`,
    ),
    one<{ id: number; title: string; starts_at: string; status: string }>(
      "SELECT id, title, starts_at, status FROM meetings WHERE status != 'ended' ORDER BY starts_at ASC LIMIT 1",
    ),
    one<{ status: string | null }>(
      "SELECT status FROM attendance WHERE user_id = ? AND date = ?",
      user.id,
      todayBangkok(),
    ),
    all<{
      id: number;
      nickname: string;
      role: string;
      avatar_color: string;
      avatar_url: string | null;
      title: string | null;
      xp: number;
    }>(
      "SELECT id, nickname, role, avatar_color, avatar_url, title, xp FROM users WHERE status = 'active' ORDER BY xp DESC LIMIT 5",
    ),
  ]);

  // ความเคลื่อนไหวล่าสุดของห้อง — รวมหลายแหล่งแล้วเรียงตามเวลา
  const [recentMessages, recentAnnouncements, recentDone, recentAttendance, recentResources] = await Promise.all([
    all<{ id: number; body: string; created_at: string; nickname: string; channel: string }>(
      `SELECT m.id, m.body, m.created_at, u.nickname, c.name AS channel
         FROM messages m JOIN users u ON u.id = m.user_id JOIN channels c ON c.id = m.channel_id
        ORDER BY m.id DESC LIMIT 3`,
    ),
    all<{ id: number; title: string; created_at: string; nickname: string }>(
      `SELECT a.id, a.title, a.created_at, u.nickname FROM announcements a JOIN users u ON u.id = a.author_id
        ORDER BY a.id DESC LIMIT 2`,
    ),
    all<{ id: number; title: string; updated_at: string; nickname: string }>(
      `SELECT t.id, t.title, ts.updated_at, u.nickname
         FROM task_status ts JOIN tasks t ON t.id = ts.task_id JOIN users u ON u.id = ts.user_id
        WHERE ts.status = 'done' ORDER BY ts.updated_at DESC LIMIT 3`,
    ),
    all<{ id: number; status: string; created_at: string; nickname: string }>(
      `SELECT a.id, a.status, a.created_at, u.nickname FROM attendance a JOIN users u ON u.id = a.user_id
        ORDER BY a.created_at DESC LIMIT 3`,
    ),
    all<{ id: number; title: string; created_at: string; nickname: string }>(
      `SELECT r.id, r.title, r.created_at, u.nickname FROM resources r JOIN users u ON u.id = r.created_by
        ORDER BY r.id DESC LIMIT 2`,
    ),
  ]);

  const activity = [
    ...recentMessages.map((row) => ({
      key: `m-${row.id}`,
      icon: "chat",
      when: row.created_at,
      who: row.nickname,
      text: `${row.channel}: ${row.body.slice(0, 70)}`,
      href: "/chat",
    })),
    ...recentAnnouncements.map((row) => ({
      key: `a-${row.id}`,
      icon: "bell",
      when: row.created_at,
      who: row.nickname,
      text: `ประกาศ “${row.title}”`,
      href: "/home#announcements",
    })),
    ...recentDone.map((row) => ({
      key: `t-${row.id}-${row.updated_at}`,
      icon: "check",
      when: row.updated_at,
      who: row.nickname,
      text: `ส่งงาน “${row.title}” แล้ว`,
      href: "/tasks",
    })),
    ...recentAttendance.map((row) => ({
      key: `at-${row.id}`,
      icon: "users",
      when: row.created_at,
      who: row.nickname,
      text: `แจ้งสถานะ ${ATTENDANCE_LABEL[row.status] ?? row.status}`,
      href: "/schedule#attendance",
    })),
    ...recentResources.map((row) => ({
      key: `r-${row.id}`,
      icon: "file",
      when: row.created_at,
      who: row.nickname,
      text: `แชร์ “${row.title}”`,
      href: "/hub#resources",
    })),
  ]
    .sort((a, b) => (a.when < b.when ? 1 : -1))
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-6 sm:p-7">
        <div className="absolute -top-24 -right-16 size-64 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative">
          <p className="text-xs font-medium tracking-wide text-indigo-300">
            {weekdayName()} · {formatDateShort(todayBangkok())}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
            สวัสดี {user.nickname} 👋
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-slate-400">
            ยินดีต้อนรับกลับสู่ศูนย์กลางห้อง SKC105 —{" "}
            {attendance?.status ? "คุณแจ้งสถานะการเข้าเรียนวันนี้แล้ว" : "อย่าลืมกดเช็กชื่อเข้าเรียนวันนี้"}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/meeting" className="btn btn-primary">
              <Icon name="video" className="size-4" /> เข้าห้องประชุม
            </Link>
            <Link href="/nox" className="btn btn-ghost">
              <Icon name="spark" className="size-4" /> ถาม Nox AI
            </Link>
            <Link href="/chat" className="btn btn-ghost">
              <Icon name="chat" className="size-4" /> แชตห้อง
            </Link>
            <Link href="/tasks" className="btn btn-ghost">
              <Icon name="tasks" className="size-4" /> การบ้านของฉัน
            </Link>
          </div>

          {nextMeeting ? (
            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3.5 py-2.5 text-xs text-indigo-200">
              <Icon name="bell" className="size-4" />
              ประชุมถัดไป: <span className="font-semibold text-white">{nextMeeting.title}</span>
              <span className="text-indigo-300/80">· {formatDateTime(nextMeeting.starts_at)}</span>
              <Link href="/meeting" className="ml-auto font-medium text-indigo-200 underline-offset-2 hover:underline">
                ดูรายละเอียด
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="การบ้านทั้งหมด" value={counts?.open_tasks ?? 0} icon="tasks" hint="ติดตามสถานะได้ที่หน้าการบ้าน" />
        <Stat label="โหวตที่เปิดอยู่" value={counts?.open_polls ?? 0} icon="chart" hint="1 บัญชี 1 เสียง" />
        <Stat label="สมาชิกในห้อง" value={counts?.members ?? 0} icon="users" hint="บัญชีที่ใช้งานอยู่" />
        <Stat label="ข้อความในห้องแชต" value={counts?.messages ?? 0} icon="chat" hint="ทุกช่องคุยรวมกัน" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-5">
          <SectionCard
            title="ประกาศปักหมุด"
            icon="pin"
            action={
              <Link href="/home#announcements" className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
                ดูทั้งหมด
              </Link>
            }
          >
            <div id="announcements">
              <AnnouncementBoard canPost={canModerate(user.role)} limit={4} />
            </div>
          </SectionCard>

          <SectionCard
            title="งานใกล้กำหนดส่ง"
            icon="tasks"
            action={
              <Link href="/tasks" className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
                ดูทั้งหมด
              </Link>
            }
          >
            <ul className="space-y-2">
              {tasks.length === 0 ? <Empty icon="tasks" title="ยังไม่มีการบ้าน" hint="แอดมินสามารถเพิ่มงานได้ที่หน้าการบ้าน" /> : null}
              {tasks.map((t) => {
                const due = dueLabel(t.due_date);
                const done = t.my_status === "done";
                return (
                  <li key={t.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5">
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                        done ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      <Icon name={done ? "check" : "clock"} className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${done ? "text-slate-500 line-through" : "text-slate-100"}`}>
                        {t.title}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {t.subject} · {t.done_count}/{t.total_members} คนทำเสร็จ
                      </p>
                    </div>
                    <span
                      className={`badge shrink-0 ${
                        due.tone === "overdue"
                          ? "bg-rose-500/15 text-rose-300 ring-rose-400/30"
                          : due.tone === "soon"
                            ? "bg-amber-500/15 text-amber-300 ring-amber-400/30"
                            : "bg-slate-500/15 text-slate-300 ring-slate-400/30"
                      }`}
                    >
                      {due.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </SectionCard>

          <SectionCard title="ความเคลื่อนไหวล่าสุด" icon="chart">
            {activity.length === 0 ? (
              <Empty icon="chat" title="ยังไม่มีความเคลื่อนไหว" hint="เริ่มแชตหรือเช็กชื่อเพื่อให้ห้องคึกคัก" />
            ) : (
              <ul className="space-y-1.5">
                {activity.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 transition hover:border-indigo-400/25 hover:bg-white/[0.05]"
                    >
                      <span className="mt-0.5 shrink-0 rounded-lg bg-indigo-500/10 p-1 text-indigo-300">
                        <Icon name={item.icon} className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-slate-200">{item.text}</span>
                        <span className="block text-[10px] text-slate-500">
                          {item.who} · {relativeTime(item.when)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-5">
          <SectionCard
            title="อันดับ XP ห้อง SKC105"
            icon="trophy"
            action={
              <Link href="/hub#leaderboard" className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
                ดูทั้งหมด
              </Link>
            }
          >
            {leaderboard.length === 0 ? (
              <Empty icon="trophy" title="ยังไม่มีสมาชิกในกระดานอันดับ" hint="สะสม XP จากการเช็กชื่อและทำการบ้าน" />
            ) : (
              <ol className="space-y-2">
                {leaderboard.map((member, index) => (
                  <li key={member.id} className="flex items-center gap-2.5">
                    <span className="w-4 shrink-0 text-center font-mono text-[11px] font-bold text-slate-500">{index + 1}</span>
                    <Avatar name={member.nickname} color={member.avatar_color} imageUrl={member.avatar_url} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 truncate text-sm font-medium text-slate-100">
                        {member.nickname}
                        <LevelBadge level={levelFromXp(member.xp)} className="!px-1 !py-0 !text-[9px]" />
                      </p>
                      <TitleBadge title={member.title} className="!px-1.5 !py-0 !text-[9px]" />
                    </div>
                    <span className="shrink-0 font-mono text-xs font-semibold text-indigo-200">{member.xp} XP</span>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          <SectionCard title="เช็กชื่อวันนี้" icon="users">
            <AttendanceWidget compact />
          </SectionCard>

          <SectionCard title={`ตารางเรียนวัน${DAY_LABEL[dow]}`} icon="calendar">
            {todayClasses.length === 0 ? (
              <Empty icon="calendar" title="วันนี้ไม่มีคาบเรียน" hint={todayDuty ? `ตารางเวร: ${todayDuty.title}` : undefined} />
            ) : (
              <ul className="space-y-2">
                {todayClasses.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2.5">
                    <div className="w-14 shrink-0 text-center">
                      <p className="font-mono text-xs font-semibold text-indigo-300">{formatClockTime(c.start_time)}</p>
                      <p className="font-mono text-[10px] text-slate-500">{formatClockTime(c.end_time)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">{c.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {[c.subject, c.location].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {todayDuty ? (
              <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                เวรประจำวัน: {todayDuty.title}
              </p>
            ) : null}
            <Link href="/schedule" className="mt-3 inline-flex text-xs font-medium text-indigo-300 hover:text-indigo-200">
              ดูตารางทั้งสัปดาห์ →
            </Link>
          </SectionCard>

          <div className="grid grid-cols-2 gap-2">
            {[
              { href: "/meeting", icon: "video", label: "ห้องประชุม", desc: "เสียง/วิดีโอ" },
              { href: "/hub", icon: "box", label: "ยืม-คืนของ", desc: "ของส่วนกลาง" },
              { href: "/hub#resources", icon: "file", label: "ชีทสรุป", desc: "ไฟล์เรียน" },
              { href: "/schedule", icon: "calendar", label: "ตารางเวร", desc: "ประจำสัปดาห์" },
            ].map((tile) => (
              <Link key={tile.label} href={tile.href} className="tile">
                <span className="text-indigo-300">
                  <Icon name={tile.icon} className="size-5" />
                </span>
                <span className="text-sm font-medium text-white">{tile.label}</span>
                <span className="text-[11px] text-slate-500">{tile.desc}</span>
              </Link>
            ))}
          </div>

          <div className="card flex items-center gap-3 p-4">
            <Avatar name={user.nickname} color={user.avatar_color} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{user.nickname}</p>
              <p className="truncate text-[11px] text-slate-500">
                {user.real_name} · {ROLE_LABEL[user.role]}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
