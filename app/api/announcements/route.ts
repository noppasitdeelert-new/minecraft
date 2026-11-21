import { ApiError, fail, json, optionalStr, readJson, str } from "@/lib/api";
import { all, one, run, nowIso } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import { logAudit, notifyChannels } from "@/lib/integrations";
import type { Announcement } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT = `SELECT a.id, a.title, a.body, a.pinned, a.important, a.created_at,
                       (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id) AS read_count,
                       (SELECT COUNT(*) FROM users WHERE status = 'active') AS reader_total,
                       EXISTS(SELECT 1 FROM announcement_reads r2 WHERE r2.announcement_id = a.id AND r2.user_id = ?) AS read_by_me,
                       u.id AS author_id, u.nickname, u.real_name, u.role, u.avatar_color
                  FROM announcements a JOIN users u ON u.id = a.author_id`;

type Row = {
  id: number;
  title: string;
  body: string;
  pinned: number;
  important: number;
  created_at: string;
  author_id: number;
  nickname: string;
  real_name: string;
  role: Announcement["author"]["role"];
  avatar_color: string;
  read_count: number;
  reader_total: number;
  read_by_me: number;
};

function shape(row: Row): Announcement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    pinned: row.pinned,
    important: row.important,
    created_at: row.created_at,
    read_count: Number(row.read_count ?? 0),
    reader_total: Number(row.reader_total ?? 0),
    read_by_me: Boolean(row.read_by_me),
    author: {
      id: row.author_id,
      nickname: row.nickname,
      real_name: row.real_name,
      role: row.role,
      avatar_color: row.avatar_color,
    },
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await all<Row>(`${SELECT} ORDER BY a.pinned DESC, a.created_at DESC LIMIT 50`, user.id);
    return json({ announcements: rows.map(shape) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canModerate(user.role)) throw new ApiError(403, "เฉพาะแอดมินหรือผู้ดูแลเท่านั้นที่โพสต์ประกาศได้");

    const body = await readJson<{ title?: string; body?: string; pinned?: boolean; important?: boolean }>(req);
    const title = str(body.title, "หัวข้อประกาศ", 140);
    const text = str(body.body, "เนื้อหาประกาศ", 8000);
    const pinned = body.pinned ? 1 : 0;
    const important = body.important ? 1 : 0;
    const now = nowIso();

    const res = await run(
      "INSERT INTO announcements (author_id, title, body, pinned, important, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      user.id,
      title,
      text,
      pinned,
      important,
      now,
      now,
    );

    await logAudit(user.id, "announcement.create", `announcement:${res.lastInsertRowid}`, title);
    if (important || pinned) {
      void notifyChannels(`📢 ประกาศใหม่จาก ${user.nickname}: **${title}**\n${text.slice(0, 1200)}`);
    }

    const row = await one<Row>(`${SELECT} WHERE a.id = ?`, user.id, res.lastInsertRowid);
    return json({ announcement: row ? shape(row) : null });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    if (!canModerate(user.role)) throw new ApiError(403, "ไม่มีสิทธิ์แก้ไขประกาศ");

    const body = await readJson<{ id?: number; pinned?: boolean; important?: boolean; title?: string; body?: string }>(req);
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "ไม่พบประกาศที่ต้องการแก้ไข");
    const existing = await one<{ title: string }>("SELECT title FROM announcements WHERE id = ?", id);
    if (!existing) throw new ApiError(404, "ไม่พบประกาศนี้");

    if (typeof body.pinned === "boolean") await run("UPDATE announcements SET pinned = ?, updated_at = ? WHERE id = ?", body.pinned ? 1 : 0, nowIso(), id);
    if (typeof body.important === "boolean")
      await run("UPDATE announcements SET important = ?, updated_at = ? WHERE id = ?", body.important ? 1 : 0, nowIso(), id);
    if (typeof body.title === "string") await run("UPDATE announcements SET title = ?, updated_at = ? WHERE id = ?", str(body.title, "หัวข้อ", 140), nowIso(), id);
    if (typeof body.body === "string") await run("UPDATE announcements SET body = ?, updated_at = ? WHERE id = ?", str(body.body, "เนื้อหา", 8000), nowIso(), id);

    await logAudit(user.id, "announcement.update", `announcement:${id}`, optionalStr(body.title, 140) ?? existing.title);
    const row = await one<Row>(`${SELECT} WHERE a.id = ?`, user.id, id);
    return json({ announcement: row ? shape(row) : null });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    if (!canModerate(user.role)) throw new ApiError(403, "ไม่มีสิทธิ์ลบประกาศ");
    const id = Number(new URL(req.url).searchParams.get("id") || 0);
    const existing = await one<{ title: string }>("SELECT title FROM announcements WHERE id = ?", id);
    if (!existing) throw new ApiError(404, "ไม่พบประกาศนี้");
    await run("DELETE FROM announcements WHERE id = ?", id);
    await logAudit(user.id, "announcement.delete", `announcement:${id}`, existing.title);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
