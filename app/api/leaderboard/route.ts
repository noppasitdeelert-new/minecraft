import { fail, json } from "@/lib/api";
import { all, one } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { LeaderboardEntry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await requireUser();
    const members = await all<LeaderboardEntry>(
      `SELECT u.id, u.nickname, u.real_name, u.role, u.avatar_color, u.avatar_url, u.title, u.xp,
              (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) AS message_count
         FROM users u
        WHERE u.status = 'active'
        ORDER BY u.xp DESC, u.nickname COLLATE NOCASE
        LIMIT 50`,
    );

    const myRank = await one<{ position: number }>(
      "SELECT COUNT(*) + 1 AS position FROM users WHERE status = 'active' AND xp > ?",
      me.xp,
    );

    return json({ members, me: { id: me.id, xp: me.xp, rank: myRank?.position ?? 1 } });
  } catch (error) {
    return fail(error);
  }
}
