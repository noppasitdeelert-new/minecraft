import { ApiError, fail, json, optionalStr, readJson, str } from "@/lib/api";
import { all, one, run, nowIso } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";
import type { Resource } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT = `SELECT r.id, r.title, r.description, r.url, r.category, r.subject, r.created_at,
                       u.id AS author_id, u.nickname, u.real_name, u.role, u.avatar_color
                  FROM resources r JOIN users u ON u.id = r.created_by`;

type Row = {
  id: number;
  title: string;
  description: string | null;
  url: string;
  category: string;
  subject: string | null;
  created_at: string;
  author_id: number;
  nickname: string;
  real_name: string;
  role: Resource["author"]["role"];
  avatar_color: string;
};

function shape(r: Row): Resource {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    url: r.url,
    category: r.category,
    subject: r.subject,
    created_at: r.created_at,
    author: { id: r.author_id, nickname: r.nickname, real_name: r.real_name, role: r.role, avatar_color: r.avatar_color },
  };
}

export async function GET() {
  try {
    await requireUser();
    const rows = await all<Row>(`${SELECT} ORDER BY r.created_at DESC LIMIT 200`);
    return json({ resources: rows.map(shape) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ title?: string; url?: string; description?: string; category?: string; subject?: string }>(req);
    const title = str(body.title, "ชื่อไฟล์/ลิงก์", 160);
    const url = str(body.url, "ลิงก์", 1000);
    if (!/^https?:\/\/.+/i.test(url) && !url.startsWith("/")) throw new ApiError(400, "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://");
    const category = ["sheet", "exam", "slide", "video", "other"].includes(String(body.category)) ? String(body.category) : "other";

    const res = await run(
      "INSERT INTO resources (title, description, url, category, subject, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      title,
      optionalStr(body.description, 1000),
      url,
      category,
      optionalStr(body.subject, 80),
      user.id,
      nowIso(),
    );
    await logAudit(user.id, "resource.create", `resource:${res.lastInsertRowid}`, title);
    const row = await one<Row>(`${SELECT} WHERE r.id = ?`, res.lastInsertRowid);
    return json({ resource: row ? shape(row) : null });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = Number(new URL(req.url).searchParams.get("id") || 0);
    const row = await one<{ created_by: number; title: string }>("SELECT created_by, title FROM resources WHERE id = ?", id);
    if (!row) throw new ApiError(404, "ไม่พบไฟล์นี้");
    if (row.created_by !== user.id && !canModerate(user.role)) throw new ApiError(403, "ไม่มีสิทธิ์ลบไฟล์นี้");
    await run("DELETE FROM resources WHERE id = ?", id);
    await logAudit(user.id, "resource.delete", `resource:${id}`, row.title);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
