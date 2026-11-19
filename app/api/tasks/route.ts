import { ApiError, fail, json, optionalStr, readJson, str } from "@/lib/api";
import { all, one, run, nowIso } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import { logAudit, notifyChannels } from "@/lib/integrations";
import type { Task } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT = `SELECT t.id, t.subject, t.title, t.description, t.due_date, t.created_at,
                       u.id AS author_id, u.nickname, u.real_name, u.role, u.avatar_color,
                       COALESCE(ts.status, 'todo') AS my_status, ts.updated_at AS my_updated_at,
                       (SELECT COUNT(*) FROM task_status x WHERE x.task_id = t.id AND x.status = 'done') AS done_count,
                       (SELECT COUNT(*) FROM task_status x WHERE x.task_id = t.id AND x.status = 'doing') AS doing_count,
                       (SELECT COUNT(*) FROM users WHERE status = 'active') AS total_members
                  FROM tasks t
                  JOIN users u ON u.id = t.created_by
                  LEFT JOIN task_status ts ON ts.task_id = t.id AND ts.user_id = ?`;

type Row = {
  id: number;
  subject: string;
  title: string;
  description: string | null;
  due_date: string | null;
  created_at: string;
  author_id: number;
  nickname: string;
  real_name: string;
  role: Task["author"]["role"];
  avatar_color: string;
  my_status: Task["my_status"];
  my_updated_at: string | null;
  done_count: number;
  doing_count: number;
  total_members: number;
};

function shape(r: Row): Task {
  return {
    id: r.id,
    subject: r.subject,
    title: r.title,
    description: r.description,
    due_date: r.due_date,
    created_at: r.created_at,
    my_status: r.my_status,
    my_updated_at: r.my_updated_at,
    done_count: r.done_count,
    doing_count: r.doing_count,
    total_members: r.total_members,
    author: {
      id: r.author_id,
      nickname: r.nickname,
      real_name: r.real_name,
      role: r.role,
      avatar_color: r.avatar_color,
    },
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    const rows = all<Row>(`${SELECT} ORDER BY (ts.status = 'done') ASC, COALESCE(t.due_date, '9999-12-31') ASC, t.id DESC`, user.id);
    return json({ tasks: rows.map(shape) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ subject?: string; title?: string; description?: string; due_date?: string }>(req);
    const subject = str(body.subject, "รายวิชา", 80);
    const title = str(body.title, "ชื่องาน", 160);
    const description = optionalStr(body.description, 4000);
    const dueRaw = optionalStr(body.due_date, 20);
    const dueDate = dueRaw ? dueRaw.slice(0, 10) : null;
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new ApiError(400, "วันครบกำหนดไม่ถูกต้อง");

    const res = run(
      "INSERT INTO tasks (subject, title, description, due_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      subject,
      title,
      description,
      dueDate,
      user.id,
      nowIso(),
    );
    logAudit(user.id, "task.create", `task:${res.lastInsertRowid}`, `${subject}: ${title}`);
    void notifyChannels(
      `📚 การบ้านใหม่ (${subject}): **${title}**${dueDate ? `\nกำหนดส่ง ${dueDate}` : ""}\nเพิ่มโดย ${user.nickname}`,
    );

    const row = one<Row>(`${SELECT} WHERE t.id = ?`, user.id, res.lastInsertRowid);
    return json({ task: row ? shape(row) : null });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ id?: number; status?: string }>(req);
    const id = Number(body.id);
    const status = String(body.status || "");
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "ไม่พบงานที่ต้องการอัปเดต");
    if (!["todo", "doing", "done"].includes(status)) throw new ApiError(400, "สถานะไม่ถูกต้อง");

    const task = one<{ id: number; title: string }>("SELECT id, title FROM tasks WHERE id = ?", id);
    if (!task) throw new ApiError(404, "ไม่พบงานนี้");

    run(
      `INSERT INTO task_status (task_id, user_id, status, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(task_id, user_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
      id,
      user.id,
      status,
      nowIso(),
    );
    return json({ ok: true, status });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = Number(new URL(req.url).searchParams.get("id") || 0);
    const task = one<{ created_by: number; title: string }>("SELECT created_by, title FROM tasks WHERE id = ?", id);
    if (!task) throw new ApiError(404, "ไม่พบงานนี้");
    if (task.created_by !== user.id && !canModerate(user.role)) throw new ApiError(403, "ไม่มีสิทธิ์ลบงานนี้");
    run("DELETE FROM tasks WHERE id = ?", id);
    logAudit(user.id, "task.delete", `task:${id}`, task.title);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
