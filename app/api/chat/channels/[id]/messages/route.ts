import { ApiError, fail, intParam, json, readJson, str } from "@/lib/api";
import { all, one, run, nowIso } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canModerate } from "@/lib/auth";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: number;
  channel_id: number;
  body: string;
  created_at: string;
  user_id: number;
  nickname: string;
  real_name: string;
  role: ChatMessage["user"]["role"];
  avatar_color: string;
};

function shape(row: Row): ChatMessage {
  return {
    id: row.id,
    channel_id: row.channel_id,
    body: row.body,
    created_at: row.created_at,
    user: {
      id: row.user_id,
      nickname: row.nickname,
      real_name: row.real_name,
      role: row.role,
      avatar_color: row.avatar_color,
    },
  };
}

const BASE_SELECT = `SELECT m.id, m.channel_id, m.body, m.created_at, u.id AS user_id, u.nickname, u.real_name, u.role, u.avatar_color
   FROM messages m JOIN users u ON u.id = m.user_id`;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const channelId = intParam((await ctx.params).id, "channelId");
    const channel = await one("SELECT id FROM channels WHERE id = ?", channelId);
    if (!channel) throw new ApiError(404, "ไม่พบห้องแชตนี้");

    const url = new URL(req.url);
    const after = Number(url.searchParams.get("after") || 0);

    let rows: Row[];
    if (after > 0) {
      rows = await all<Row>(`${BASE_SELECT} WHERE m.channel_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 200`, channelId, after);
    } else {
      const latest = await all<Row>(`${BASE_SELECT} WHERE m.channel_id = ? ORDER BY m.id DESC LIMIT 100`, channelId);
      rows = latest.reverse();
    }

    return json({ messages: rows.map(shape), channelId });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const channelId = intParam((await ctx.params).id, "channelId");
    const channel = await one("SELECT id FROM channels WHERE id = ?", channelId);
    if (!channel) throw new ApiError(404, "ไม่พบห้องแชตนี้");

    const body = await readJson<{ body?: string }>(req);
    const text = str(body.body, "ข้อความ", 2000);

    const res = await run("INSERT INTO messages (channel_id, user_id, body, created_at) VALUES (?, ?, ?, ?)", channelId, user.id, text, nowIso());
    const row = await one<Row>(`${BASE_SELECT} WHERE m.id = ?`, res.lastInsertRowid);
    if (!row) throw new ApiError(500, "ส่งข้อความไม่สำเร็จ");

    return json({ message: shape(row) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const channelId = intParam((await ctx.params).id, "channelId");
    const messageId = Number(new URL(req.url).searchParams.get("messageId") || 0);
    const row = await one<{ user_id: number }>("SELECT user_id FROM messages WHERE id = ? AND channel_id = ?", messageId, channelId);
    if (!row) throw new ApiError(404, "ไม่พบข้อความนี้");
    if (row.user_id !== user.id && !canModerate(user.role)) throw new ApiError(403, "ลบข้อความของผู้อื่นไม่ได้");

    await run("DELETE FROM messages WHERE id = ?", messageId);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
