const TZ = "Asia/Bangkok";

const dateFmt = new Intl.DateTimeFormat("th-TH", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const dateShortFmt = new Intl.DateTimeFormat("th-TH", { timeZone: TZ, day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat("th-TH", { timeZone: TZ, weekday: "long" });

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00+07:00` : value);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

export function formatDateShort(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00+07:00` : value);
  return Number.isNaN(d.getTime()) ? "—" : dateShortFmt.format(d);
}

export function formatTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : timeFmt.format(d);
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return `${formatDateShort(value)} ${formatTime(value)}`;
}

export function formatClockTime(hhmm?: string | null): string {
  return hhmm ? hhmm.slice(0, 5) : "—";
}

export function weekdayName(value: Date = new Date()): string {
  return weekdayFmt.format(value);
}

export function todayBangkok(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
  return parts; // YYYY-MM-DD
}

export function currentWeekday(): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

export function relativeTime(value?: string | null): string {
  if (!value) return "—";
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "เมื่อสักครู่";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} วันที่แล้ว`;
  return formatDateShort(value);
}

export function dueLabel(due?: string | null): { text: string; tone: "overdue" | "soon" | "normal" | "none" } {
  if (!due) return { text: "ไม่กำหนดส่ง", tone: "none" };
  const today = todayBangkok();
  const dueDay = due.slice(0, 10);
  if (dueDay < today) return { text: `เลยกำหนด ${formatDateShort(dueDay)}`, tone: "overdue" };
  if (dueDay === today) return { text: "ครบกำหนดวันนี้", tone: "soon" };
  const days = Math.round((new Date(`${dueDay}T00:00:00+07:00`).getTime() - new Date(`${today}T00:00:00+07:00`).getTime()) / 86400000);
  if (days <= 2) return { text: `อีก ${days} วัน (${formatDateShort(dueDay)})`, tone: "soon" };
  return { text: formatDateShort(dueDay), tone: "normal" };
}

export function initials(nickname?: string | null): string {
  const name = (nickname || "?").trim();
  return name.slice(0, 2).toUpperCase();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
