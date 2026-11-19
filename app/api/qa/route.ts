import { fail, json, optionalStr, readJson, str } from "@/lib/api";
import { all, run, nowIso } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";
import type { QaPost } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();

    const posts = await all<{
      id: number;
      title: string;
      body: string;
      subject: string | null;
      resolved: number;
      created_at: string;
      author_id: number;
      nickname: string;
      real_name: string;
      role: QaPost["author"]["role"];
      avatar_color: string;
    }>(
      `SELECT q.id, q.title, q.body, q.subject, q.resolved, q.created_at,
              u.id AS author_id, u.nickname, u.real_name, u.role, u.avatar_color
         FROM qa_posts q JOIN users u ON u.id = q.user_id
        ORDER BY q.resolved ASC, q.created_at DESC
        LIMIT 100`,
    );

    const answers = await all<{
      id: number;
      post_id: number;
      body: string;
      created_at: string;
      author_id: number;
      nickname: string;
      real_name: string;
      role: QaPost["author"]["role"];
      avatar_color: string;
    }>(
      `SELECT a.id, a.post_id, a.body, a.created_at,
              u.id AS author_id, u.nickname, u.real_name, u.role, u.avatar_color
         FROM qa_answers a JOIN users u ON u.id = a.user_id
        ORDER BY a.id ASC`,
    );

    const result: QaPost[] = posts.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      subject: p.subject,
      resolved: p.resolved,
      created_at: p.created_at,
      author: { id: p.author_id, nickname: p.nickname, real_name: p.real_name, role: p.role, avatar_color: p.avatar_color },
      answers: answers
        .filter((a) => a.post_id === p.id)
        .map((a) => ({
          id: a.id,
          body: a.body,
          created_at: a.created_at,
          author: { id: a.author_id, nickname: a.nickname, real_name: a.real_name, role: a.role, avatar_color: a.avatar_color },
        })),
    }));

    return json({ posts: result });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ title?: string; body?: string; subject?: string }>(req);
    const title = str(body.title, "หัวข้อคำถาม", 160);
    const text = str(body.body, "รายละเอียดคำถาม", 5000);

    const res = await run(
      "INSERT INTO qa_posts (user_id, title, body, subject, created_at) VALUES (?, ?, ?, ?, ?)",
      user.id,
      title,
      text,
      optionalStr(body.subject, 80),
      nowIso(),
    );
    await logAudit(user.id, "qa.create", `qa:${res.lastInsertRowid}`, title);
    return json({ ok: true, id: res.lastInsertRowid });
  } catch (error) {
    return fail(error);
  }
}
