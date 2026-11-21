import { fail, json } from "@/lib/api";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaletteResult = {
  kind: "member" | "message" | "announcement" | "task" | "resource" | "schedule" | "qa";
  id: number;
  title: string;
  subtitle: string | null;
  href: string;
};

/** ค้นหาข้ามระบบ (สมาชิก, แชต, ประกาศ, การบ้าน, ชีท, ตาราง, ถาม-ตอบ) */
export async function GET(req: Request) {
  try {
    await requireUser();
    const raw = (new URL(req.url).searchParams.get("q") || "").trim();
    if (raw.length < 2) return json({ results: [] as PaletteResult[], query: raw });

    const like = `%${raw.replace(/[%_]/g, "")}%`;
    const results: PaletteResult[] = [];

    const members = await all<{ id: number; nickname: string; real_name: string; role: string }>(
      "SELECT id, nickname, real_name, role FROM users WHERE status = 'active' AND (nickname LIKE ? OR real_name LIKE ?) ORDER BY xp DESC LIMIT 5",
      like,
      like,
    );
    for (const row of members) {
      results.push({
        kind: "member",
        id: row.id,
        title: row.nickname,
        subtitle: row.real_name,
        href: `/members#member-${row.id}`,
      });
    }

    const messages = await all<{ id: number; channel_id: number; body: string; nickname: string; slug: string }>(
      `SELECT m.id, m.channel_id, m.body, u.nickname, c.slug
         FROM messages m JOIN users u ON u.id = m.user_id JOIN channels c ON c.id = m.channel_id
        WHERE m.body LIKE ? ORDER BY m.id DESC LIMIT 5`,
      like,
    );
    for (const row of messages) {
      results.push({
        kind: "message",
        id: row.id,
        title: row.body.slice(0, 90),
        subtitle: `แชต #${row.slug} · ${row.nickname}`,
        href: `/chat?channel=${row.channel_id}`,
      });
    }

    const announcements = await all<{ id: number; title: string; body: string }>(
      "SELECT id, title, body FROM announcements WHERE title LIKE ? OR body LIKE ? ORDER BY created_at DESC LIMIT 4",
      like,
      like,
    );
    for (const row of announcements) {
      results.push({
        kind: "announcement",
        id: row.id,
        title: row.title,
        subtitle: row.body.slice(0, 90),
        href: "/home#announcements",
      });
    }

    const tasks = await all<{ id: number; title: string; subject: string; due_date: string | null }>(
      "SELECT id, title, subject, due_date FROM tasks WHERE title LIKE ? OR subject LIKE ? ORDER BY id DESC LIMIT 4",
      like,
      like,
    );
    for (const row of tasks) {
      results.push({
        kind: "task",
        id: row.id,
        title: row.title,
        subtitle: `${row.subject}${row.due_date ? ` · ส่ง ${row.due_date}` : ""}`,
        href: "/tasks",
      });
    }

    const resources = await all<{ id: number; title: string; url: string }>(
      "SELECT id, title, url FROM resources WHERE title LIKE ? OR description LIKE ? ORDER BY id DESC LIMIT 4",
      like,
      like,
    );
    for (const row of resources) {
      results.push({ kind: "resource", id: row.id, title: row.title, subtitle: "ชีท/ไฟล์เรียน", href: "/hub#resources" });
    }

    const schedule = await all<{ id: number; title: string; kind: string }>(
      "SELECT id, title, kind FROM schedule_entries WHERE title LIKE ? ORDER BY id DESC LIMIT 4",
      like,
    );
    for (const row of schedule) {
      results.push({
        kind: "schedule",
        id: row.id,
        title: row.title,
        subtitle: row.kind === "class" ? "คาบเรียน" : row.kind === "duty" ? "ตารางเวร" : "นัดหมาย",
        href: "/schedule",
      });
    }

    const qa = await all<{ id: number; title: string; body: string }>(
      "SELECT id, title, body FROM qa_posts WHERE title LIKE ? OR body LIKE ? ORDER BY id DESC LIMIT 4",
      like,
      like,
    );
    for (const row of qa) {
      results.push({ kind: "qa", id: row.id, title: row.title, subtitle: row.body.slice(0, 90), href: "/hub#qa" });
    }

    return json({ query: raw, results: results.slice(0, 24) });
  } catch (error) {
    return fail(error);
  }
}
