import { ApiError, fail, json, optionalStr, readJson, str } from "@/lib/api";
import { all, one, run, nowIso } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";
import type { ScheduleEntry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const entries = await all<ScheduleEntry>(
      `SELECT id, kind, title, subject, location, day_of_week, start_time, end_time, date, note, created_by
         FROM schedule_entries
        ORDER BY kind, COALESCE(day_of_week, 7), COALESCE(start_time, ''), COALESCE(date, '')`,
    );
    return json({ entries });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    // สมาชิกทุกคนเพิ่มรายการตารางเรียน/ตารางเวรได้
    const user = await requireUser();

    const body = await readJson<{
      kind?: string;
      title?: string;
      subject?: string;
      location?: string;
      day_of_week?: number | string;
      start_time?: string;
      end_time?: string;
      date?: string;
      note?: string;
    }>(req);

    const kind = ["class", "duty", "event"].includes(String(body.kind)) ? String(body.kind) : "class";
    const title = str(body.title, "ชื่อรายการ", 120);
    const subject = optionalStr(body.subject, 80);
    const location = optionalStr(body.location, 80);
    const note = optionalStr(body.note, 500);
    const startTime = optionalStr(body.start_time, 5);
    const endTime = optionalStr(body.end_time, 5);
    const date = optionalStr(body.date, 10);

    let day: number | null = null;
    if (body.day_of_week !== undefined && body.day_of_week !== null && String(body.day_of_week) !== "") {
      day = Number(body.day_of_week);
      if (!Number.isInteger(day) || day < 0 || day > 6) throw new ApiError(400, "วันในสัปดาห์ไม่ถูกต้อง");
    }
    if (kind !== "event" && day === null) throw new ApiError(400, "กรุณาเลือกวันในสัปดาห์");
    if (kind === "event" && (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new ApiError(400, "กรุณาระบุวันที่ของนัดหมาย");
    for (const t of [startTime, endTime]) {
      if (t && !/^\d{2}:\d{2}$/.test(t)) throw new ApiError(400, "รูปแบบเวลาไม่ถูกต้อง (HH:MM)");
    }

    const res = await run(
      `INSERT INTO schedule_entries (kind, title, subject, location, day_of_week, start_time, end_time, date, note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      kind,
      title,
      subject,
      location,
      kind === "event" ? null : day,
      kind === "event" ? null : startTime,
      kind === "event" ? null : endTime,
      kind === "event" ? date : null,
      note,
      user.id,
      nowIso(),
    );
    await logAudit(user.id, "schedule.create", `schedule:${res.lastInsertRowid}`, `${kind}: ${title}`);

    const entry = await one<ScheduleEntry>(
      "SELECT id, kind, title, subject, location, day_of_week, start_time, end_time, date, note, created_by FROM schedule_entries WHERE id = ?",
      res.lastInsertRowid,
    );
    return json({ entry });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = Number(new URL(req.url).searchParams.get("id") || 0);
    const entry = await one<{ title: string; created_by: number | null }>(
      "SELECT title, created_by FROM schedule_entries WHERE id = ?",
      id,
    );
    if (!entry) throw new ApiError(404, "ไม่พบรายการนี้");
    // ลบได้เฉพาะรายการที่ตัวเองสร้าง หรือแอดมิน/ผู้ดูแล
    if (!canModerate(user.role) && entry.created_by !== user.id) {
      throw new ApiError(403, "ลบได้เฉพาะรายการที่คุณสร้างเอง หรือให้แอดมินลบให้");
    }
    await run("DELETE FROM schedule_entries WHERE id = ?", id);
    await logAudit(user.id, "schedule.delete", `schedule:${id}`, entry.title);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
