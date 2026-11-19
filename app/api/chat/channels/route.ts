import { fail, json } from "@/lib/api";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const channels = all<{
      id: number;
      slug: string;
      name: string;
      description: string | null;
      icon: string;
      sort_order: number;
      message_count: number;
      last_body: string | null;
      last_at: string | null;
    }>(
      `SELECT c.id, c.slug, c.name, c.description, c.icon, c.sort_order,
              (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id) AS message_count,
              (SELECT m.body FROM messages m WHERE m.channel_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
              (SELECT m.created_at FROM messages m WHERE m.channel_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at
         FROM channels c
        ORDER BY c.sort_order, c.id`,
    );
    return json({ channels });
  } catch (error) {
    return fail(error);
  }
}
