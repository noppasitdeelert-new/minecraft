import { ApiError, fail, json, optionalStr, readJson, str } from "@/lib/api";
import { all, run, nowIso } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logAudit, notifyChannels } from "@/lib/integrations";
import type { Poll } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();

    const polls = await all<{
      id: number;
      question: string;
      description: string | null;
      status: "open" | "closed";
      created_at: string;
      author_id: number;
      nickname: string;
      real_name: string;
      role: Poll["author"]["role"];
      avatar_color: string;
    }>(
      `SELECT p.id, p.question, p.description, p.status, p.created_at,
              u.id AS author_id, u.nickname, u.real_name, u.role, u.avatar_color
         FROM polls p JOIN users u ON u.id = p.created_by
        ORDER BY (p.status = 'closed') ASC, p.created_at DESC`,
    );

    const options = await all<{ id: number; poll_id: number; label: string; votes: number; voters: string | null }>(
      `SELECT o.id, o.poll_id, o.label,
              (SELECT COUNT(*) FROM poll_votes v WHERE v.option_id = o.id) AS votes,
              (SELECT GROUP_CONCAT(u.nickname, ', ') FROM poll_votes v JOIN users u ON u.id = v.user_id WHERE v.option_id = o.id) AS voters
         FROM poll_options o
        ORDER BY o.id`,
    );

    const mine = await all<{ poll_id: number; option_id: number }>("SELECT poll_id, option_id FROM poll_votes WHERE user_id = ?", user.id);

    const result: Poll[] = polls.map((p) => {
      const pollOptions = options
        .filter((o) => o.poll_id === p.id)
        .map((o) => ({
          id: o.id,
          label: o.label,
          votes: Number(o.votes),
          voters: o.voters ? o.voters.split(", ") : [],
        }));
      return {
        id: p.id,
        question: p.question,
        description: p.description,
        status: p.status,
        created_at: p.created_at,
        author: {
          id: p.author_id,
          nickname: p.nickname,
          real_name: p.real_name,
          role: p.role,
          avatar_color: p.avatar_color,
        },
        options: pollOptions,
        my_option_id: mine.find((m) => m.poll_id === p.id)?.option_id ?? null,
        total_votes: pollOptions.reduce((sum, o) => sum + o.votes, 0),
      };
    });

    return json({ polls: result });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ question?: string; description?: string; options?: string[] }>(req);
    const question = str(body.question, "คำถามโพล", 200);
    const description = optionalStr(body.description, 500);
    const rawOptions = Array.isArray(body.options) ? body.options : [];
    const options = rawOptions.map((o) => String(o).trim()).filter(Boolean).slice(0, 10);
    if (options.length < 2) throw new ApiError(400, "ต้องมีตัวเลือกอย่างน้อย 2 ข้อ");

    const res = await run("INSERT INTO polls (question, description, created_by, created_at) VALUES (?, ?, ?, ?)", question, description, user.id, nowIso());
    const insertOption = (label: string) => run("INSERT INTO poll_options (poll_id, label) VALUES (?, ?)", res.lastInsertRowid, label);
    for (const label of options) await insertOption(label.slice(0, 120));

    await logAudit(user.id, "poll.create", `poll:${res.lastInsertRowid}`, question);
    void notifyChannels(`🗳️ โพลใหม่: **${question}**\nโดย ${user.nickname}`);
    return json({ ok: true, id: res.lastInsertRowid });
  } catch (error) {
    return fail(error);
  }
}
