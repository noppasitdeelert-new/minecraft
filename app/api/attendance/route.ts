import { fail, json, readJson, optionalStr, ApiError } from "@/lib/api";
import { all, run, nowIso } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = ["present", "late", "sick", "leave", "absent"];

function bkkToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const date = (url.searchParams.get("date") || bkkToday()).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "รูปแบบวันที่ไม่ถูกต้อง");

    const records = all<{
      user_id: number;
      nickname: string;
      role: string;
      avatar_color: string;
      status: string | null;
      note: string | null;
      created_at: string | null;
    }>(
      `SELECT u.id AS user_id, u.nickname, u.role, u.avatar_color, a.status, a.note, a.created_at
         FROM users u
         LEFT JOIN attendance a ON a.user_id = u.id AND a.date = ?
        WHERE u.status = 'active'
        ORDER BY (a.status IS NULL), u.nickname COLLATE NOCASE`,
      date,
    );

    const summary = VALID.reduce<Record<string, number>>((acc, key) => {
      acc[key] = records.filter((r) => r.status === key).length;
      return acc;
    }, {});
    summary.not_checked = records.filter((r) => !r.status).length;

    return json({
      date,
      today: bkkToday(),
      records,
      summary,
      mine: records.find((r) => r.user_id === user.id) ?? null,
      total: records.length,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ status?: string; note?: string }>(req);
    const status = String(body.status || "");
    if (!VALID.includes(status)) throw new ApiError(400, "สถานะการเข้าเรียนไม่ถูกต้อง");
    const note = optionalStr(body.note, 200);
    const date = bkkToday();

    run(
      `INSERT INTO attendance (user_id, date, status, note, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET status = excluded.status, note = excluded.note, created_at = excluded.created_at`,
      user.id,
      date,
      status,
      note,
      nowIso(),
    );

    logAudit(user.id, "attendance.checkin", `attendance:${date}`, `แจ้งสถานะ ${status}`);
    return json({ ok: true, date, status, note });
  } catch (error) {
    return fail(error);
  }
}
