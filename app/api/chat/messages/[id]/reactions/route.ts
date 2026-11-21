import { ApiError, fail, intParam, json, readJson } from "@/lib/api";
import { all, one, run, nowIso } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import type { MessageReaction } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ชุดอิโมจิที่อนุญาต — กันการยิงสตริงแปลกปลอมเข้ามาเป็นชื่อรีแอ็กชัน */
const REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "✅", "👀"];

async function reactionsOf(messageId: number, meId: number): Promise<MessageReaction[]> {
  const rows = await all<{ emoji: string; user_id: number }>(
    "SELECT emoji, user_id FROM message_reactions WHERE message_id = ?",
    messageId,
  );
  const bucket = new Map<string, { count: number; mine: boolean }>();
  for (const row of rows) {
    const entry = bucket.get(row.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    if (Number(row.user_id) === meId) entry.mine = true;
    bucket.set(row.emoji, entry);
  }
  return Array.from(bucket.entries()).map(([emoji, value]) => ({
    emoji,
    count: value.count,
    mine: value.mine,
  }));
}

/** กดอิโมจิซ้ำ = ยกเลิก (toggle) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    await rateLimit(`reaction:${user.id}`, 120, 60);

    const messageId = intParam((await ctx.params).id, "messageId");
    const body = await readJson<{ emoji?: string }>(req);
    const emoji = String(body.emoji || "");
    if (!REACTION_EMOJIS.includes(emoji)) throw new ApiError(400, "อิโมจินี้ไม่รองรับ");

    const message = await one("SELECT id FROM messages WHERE id = ?", messageId);
    if (!message) throw new ApiError(404, "ไม่พบข้อความนี้");

    const existing = await one(
      "SELECT 1 FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
      messageId,
      user.id,
      emoji,
    );
    if (existing) {
      await run(
        "DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
        messageId,
        user.id,
        emoji,
      );
    } else {
      await run(
        "INSERT OR IGNORE INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)",
        messageId,
        user.id,
        emoji,
        nowIso(),
      );
    }

    return json({ reactions: await reactionsOf(messageId, user.id) });
  } catch (error) {
    return fail(error);
  }
}
