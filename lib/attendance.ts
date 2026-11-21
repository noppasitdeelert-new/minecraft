import { all } from "./db";

/** วันที่ปัจจุบันตามเวลาไทย (YYYY-MM-DD) */
export function bkkToday(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type AttendanceDay = { date: string; status: string };

const COUNTED = new Set(["present", "late"]);

/**
 * สถิติการเข้าเรียนของสมาชิกหนึ่งคน: สตรีคปัจจุบัน, สตรีคสูงสุด, สรุปเดือนนี้
 * และปฏิทิน 28 วันล่าสุดสำหรับแสดงเป็นตารางเล็ก ๆ
 */
export async function attendanceStats(userId: number): Promise<{
  streak: number;
  best: number;
  month: { present: number; late: number; absent: number; leave: number; sick: number; recorded: number };
  calendar: AttendanceDay[];
  totalPresent: number;
}> {
  const rows = await all<AttendanceDay>(
    "SELECT date, status FROM attendance WHERE user_id = ? ORDER BY date ASC",
    userId,
  );

  const counted = rows.filter((r) => COUNTED.has(r.status)).map((r) => r.date);
  const countedSet = new Set(counted);

  // สตรีคสูงสุด: นับวันติดกันตามปฏิทิน โดยนับเฉพาะวันที่มีเรียน (วันธรรมดา)
  let best = 0;
  let running = 0;
  let cursor: Date | null = null;
  for (const date of counted) {
    const day = new Date(`${date}T00:00:00+07:00`);
    if (cursor && day.getTime() - cursor.getTime() === 86400000) running += 1;
    else running = 1;
    best = Math.max(best, running);
    cursor = day;
  }

  // สตรีคปัจจุบัน: ถอยหลังทีละวันจากวันนี้ (ข้ามวันหยุดสุดสัปดาห์)
  let streak = 0;
  for (let i = 0; i < 120; i += 1) {
    const date = bkkToday(-i);
    const weekday = new Date(`${date}T00:00:00+07:00`).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    if (countedSet.has(date)) {
      streak += 1;
      continue;
    }
    if (i === 0) continue; // ยังไม่เช็กชื่อวันนี้ก็ไม่ตัดสตรีค
    if (weekend) continue;
    break;
  }

  const monthKey = bkkToday().slice(0, 7);
  const month = { present: 0, late: 0, absent: 0, leave: 0, sick: 0, recorded: 0 };
  for (const row of rows) {
    if (!row.date.startsWith(monthKey)) continue;
    month.recorded += 1;
    if (row.status === "present") month.present += 1;
    else if (row.status === "late") month.late += 1;
    else if (row.status === "absent") month.absent += 1;
    else if (row.status === "leave") month.leave += 1;
    else if (row.status === "sick") month.sick += 1;
  }

  const byDate = new Map(rows.map((row) => [row.date, row.status]));
  const calendar: AttendanceDay[] = [];
  for (let i = 27; i >= 0; i -= 1) {
    const date = bkkToday(-i);
    calendar.push({ date, status: byDate.get(date) ?? "" });
  }

  return { streak, best, month, calendar, totalPresent: counted.length };
}
