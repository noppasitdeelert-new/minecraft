import { all, one, run, nowIso } from "./db";
import { levelFromXp } from "./levels";
import { attendanceStats } from "./attendance";

/** แคตตาล็อกป้ายความสำเร็จ — ปลดล็อกอัตโนมัติเมื่อเข้าเงื่อนไข */
export type BadgeDef = {
  code: string;
  label: string;
  emoji: string;
  hint: string;
};

export const BADGES: BadgeDef[] = [
  { code: "first_message", label: "ทักทายครั้งแรก", emoji: "👋", hint: "ส่งข้อความแรกในแชตห้อง" },
  { code: "chatterbox", label: "นักเลงคีย์บอร์ด", emoji: "💬", hint: "ส่งครบ 100 ข้อความ" },
  { code: "helper", label: "ผู้ช่วยเพื่อน", emoji: "🤝", hint: "ตอบคำถามในบอร์ด 5 ครั้ง" },
  { code: "bookworm", label: "นักแชร์ชีท", emoji: "📚", hint: "แชร์ชีท/ไฟล์เรียน 3 ชิ้น" },
  { code: "duty_master", label: "ปิดงานครบ", emoji: "✅", hint: "ทำการบ้านเสร็จ 10 งาน" },
  { code: "early_bird", label: "ขาเช็กชื่อ", emoji: "🌅", hint: "เช็กชื่อเข้าเรียน 10 วัน" },
  { code: "streak_7", label: "สตรีค 7 วัน", emoji: "🔥", hint: "เข้าเรียนติดกัน 7 วัน" },
  { code: "voter", label: "เสียงของห้อง", emoji: "🗳️", hint: "ร่วมโหวต 5 ครั้ง" },
  { code: "level_5", label: "เลเวล 5", emoji: "⭐", hint: "สะสม XP จนถึงเลเวล 5" },
  { code: "level_10", label: "เลเวล 10", emoji: "🌟", hint: "สะสม XP จนถึงเลเวล 10" },
  { code: "veteran_30", label: "อยู่กับห้องครบเดือน", emoji: "🎖️", hint: "เป็นสมาชิกครบ 30 วัน" },
];

const BY_CODE = new Map(BADGES.map((badge) => [badge.code, badge]));

export function badgeDef(code: string): BadgeDef | undefined {
  return BY_CODE.get(code);
}

export type EarnedBadge = BadgeDef & { earned_at: string };

export async function badgesFor(userId: number): Promise<EarnedBadge[]> {
  const rows = await all<{ code: string; earned_at: string }>(
    "SELECT code, earned_at FROM user_badges WHERE user_id = ? ORDER BY id",
    userId,
  );
  return rows.flatMap((row) => {
    const def = BY_CODE.get(row.code);
    return def ? [{ ...def, earned_at: row.earned_at }] : [];
  });
}

type Stats = {
  messages: number;
  answers: number;
  resources: number;
  tasks_done: number;
  votes: number;
  attendance: number;
  xp: number;
  created_at: string | null;
};

/**
 * ตรวจเงื่อนไขทั้งหมดของสมาชิกแล้วบันทึกป้ายที่ยังไม่มี
 * เรียกได้บ่อย (INSERT OR IGNORE) — ไม่มีผลข้างเคียงถ้าได้ครบแล้ว
 */
export async function syncBadges(userId: number): Promise<EarnedBadge[]> {
  const stats = await one<Stats>(
    `SELECT
       (SELECT COUNT(*) FROM messages WHERE user_id = ?) AS messages,
       (SELECT COUNT(*) FROM qa_answers WHERE user_id = ?) AS answers,
       (SELECT COUNT(*) FROM resources WHERE created_by = ?) AS resources,
       (SELECT COUNT(*) FROM task_status WHERE user_id = ? AND status = 'done') AS tasks_done,
       (SELECT COUNT(*) FROM poll_votes WHERE user_id = ?) AS votes,
       (SELECT COUNT(*) FROM attendance WHERE user_id = ? AND status IN ('present','late')) AS attendance,
       (SELECT xp FROM users WHERE id = ?) AS xp,
       (SELECT created_at FROM users WHERE id = ?) AS created_at`,
    userId,
    userId,
    userId,
    userId,
    userId,
    userId,
    userId,
    userId,
  );
  if (!stats) return [];

  const level = levelFromXp(stats.xp);
  const { streak } = await attendanceStats(userId);
  const days = stats.created_at
    ? Math.floor((Date.now() - new Date(stats.created_at).getTime()) / 86400000)
    : 0;

  const unlocked: string[] = [];
  if (Number(stats.messages) >= 1) unlocked.push("first_message");
  if (Number(stats.messages) >= 100) unlocked.push("chatterbox");
  if (Number(stats.answers) >= 5) unlocked.push("helper");
  if (Number(stats.resources) >= 3) unlocked.push("bookworm");
  if (Number(stats.tasks_done) >= 10) unlocked.push("duty_master");
  if (Number(stats.attendance) >= 10) unlocked.push("early_bird");
  if (streak >= 7) unlocked.push("streak_7");
  if (Number(stats.votes) >= 5) unlocked.push("voter");
  if (level >= 5) unlocked.push("level_5");
  if (level >= 10) unlocked.push("level_10");
  if (days >= 30) unlocked.push("veteran_30");

  const now = nowIso();
  for (const code of unlocked) {
    await run("INSERT OR IGNORE INTO user_badges (user_id, code, earned_at) VALUES (?, ?, ?)", userId, code, now);
  }
  return badgesFor(userId);
}

/** จำนวนป้ายที่สมาชิกทุกคนถืออยู่ — ใช้โชว์บนกระดานอันดับ */
export async function badgeCounts(): Promise<Map<number, number>> {
  const rows = await all<{ user_id: number; n: number }>(
    "SELECT user_id, COUNT(*) AS n FROM user_badges GROUP BY user_id",
  );
  return new Map(rows.map((row) => [Number(row.user_id), Number(row.n)]));
}
