import { fail } from "@/lib/api";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { bkkToday } from "@/lib/attendance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** หนีอักขระพิเศษตาม RFC 5545 */
function esc(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** พับบรรทัดที่ยาวเกิน 75 octet ให้ถูกต้องตามสเปก */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 73) {
    parts.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

function stamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** วันที่ของ "วันถัดไปที่มีวันในสัปดาห์นี้" (เวลาไทย) แบบ YYYYMMDD */
function nextDateForWeekday(dayOfWeek: number): string {
  const [y, m, d] = bkkToday().split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const current = base.getUTCDay();
  const offset = (((dayOfWeek - current) % 7) + 7) % 7;
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10).replace(/-/g, "");
}

function compact(date: string): string {
  return date.replace(/-/g, "");
}

function timeOf(value: string | null | undefined, fallback: string): string {
  const raw = (value ?? "").slice(0, 5).replace(":", "");
  return /^\d{4}$/.test(raw) ? raw : fallback;
}

export async function GET() {
  try {
    await requireUser();

    const [classes, duties, events, tasks, meetings] = await Promise.all([
      all<{ id: number; title: string; subject: string | null; location: string | null; day_of_week: number; start_time: string | null; end_time: string | null; note: string | null }>(
        "SELECT id, title, subject, location, day_of_week, start_time, end_time, note FROM schedule_entries WHERE kind = 'class' AND day_of_week IS NOT NULL ORDER BY day_of_week, start_time",
      ),
      all<{ id: number; title: string; day_of_week: number | null; note: string | null }>(
        "SELECT id, title, day_of_week, note FROM schedule_entries WHERE kind = 'duty' ORDER BY day_of_week",
      ),
      all<{ id: number; title: string; date: string | null; note: string | null; location: string | null }>(
        "SELECT id, title, date, note, location FROM schedule_entries WHERE kind = 'event' AND date IS NOT NULL",
      ),
      all<{ id: number; subject: string; title: string; due_date: string | null; description: string | null }>(
        "SELECT id, subject, title, due_date, description FROM tasks WHERE due_date IS NOT NULL",
      ),
      all<{ id: number; title: string; starts_at: string; agenda: string | null }>(
        "SELECT id, title, starts_at, agenda FROM meetings WHERE status != 'ended'",
      ),
    ]);

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//SKC105 Room Hub//TH//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:SKC105 Room Hub",
      "X-WR-TIMEZONE:Asia/Bangkok",
    ];

    for (const c of classes) {
      const day = BYDAY[Number(c.day_of_week)] ?? "MO";
      const start = `${nextDateForWeekday(Number(c.day_of_week))}T${timeOf(c.start_time, "083000")}00`;
      const end = `${nextDateForWeekday(Number(c.day_of_week))}T${timeOf(c.end_time, "100000")}00`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:class-${c.id}@skc105-room-hub`,
        `DTSTAMP:${stamp()}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${day}`,
        `SUMMARY:${esc(`[เรียน] ${c.title}`)}`,
        ...(c.subject ? [`DESCRIPTION:${esc(`ผู้สอน/หมายเหตุ: ${c.subject}${c.note ? ` · ${c.note}` : ""}`)}`] : []),
        ...(c.location ? [`LOCATION:${esc(c.location)}`] : []),
        "END:VEVENT",
      );
    }

    for (const d of duties) {
      if (d.day_of_week === null) continue;
      lines.push(
        "BEGIN:VEVENT",
        `UID:duty-${d.id}@skc105-room-hub`,
        `DTSTAMP:${stamp()}`,
        `DTSTART;VALUE=DATE:${nextDateForWeekday(Number(d.day_of_week))}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[Number(d.day_of_week)] ?? "MO"}`,
        `SUMMARY:${esc(`[เวร] ${d.title}`)}`,
        ...(d.note ? [`DESCRIPTION:${esc(d.note)}`] : []),
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      );
    }

    for (const e of events) {
      if (!e.date) continue;
      lines.push(
        "BEGIN:VEVENT",
        `UID:event-${e.id}@skc105-room-hub`,
        `DTSTAMP:${stamp()}`,
        `DTSTART;VALUE=DATE:${compact(e.date)}`,
        `SUMMARY:${esc(e.title)}`,
        ...(e.note || e.location ? [`DESCRIPTION:${esc([e.location, e.note].filter(Boolean).join(" · "))}`] : []),
        "END:VEVENT",
      );
    }

    for (const t of tasks) {
      if (!t.due_date) continue;
      lines.push(
        "BEGIN:VEVENT",
        `UID:task-${t.id}@skc105-room-hub`,
        `DTSTAMP:${stamp()}`,
        `DTSTART;VALUE=DATE:${compact(t.due_date)}`,
        `SUMMARY:${esc(`[ส่งงาน] ${t.subject} — ${t.title}`)}`,
        ...(t.description ? [`DESCRIPTION:${esc(t.description)}`] : []),
        "END:VEVENT",
      );
    }

    for (const m of meetings) {
      const start = new Date(m.starts_at);
      if (Number.isNaN(start.getTime())) continue;
      const end = new Date(start.getTime() + 60 * 60000);
      const fmt = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      lines.push(
        "BEGIN:VEVENT",
        `UID:meeting-${m.id}@skc105-room-hub`,
        `DTSTAMP:${stamp()}`,
        `DTSTART:${fmt(start)}`,
        `DTEND:${fmt(end)}`,
        `SUMMARY:${esc(`[ประชุม] ${m.title}`)}`,
        ...(m.agenda ? [`DESCRIPTION:${esc(m.agenda)}`] : []),
        "END:VEVENT",
      );
    }

    lines.push("END:VCALENDAR");

    const body = lines.map(fold).join("\r\n") + "\r\n";
    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="skc105-calendar.ics"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fail(error);
  }
}
