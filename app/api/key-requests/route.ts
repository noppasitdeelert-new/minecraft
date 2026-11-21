import { ApiError, fail, json, optionalStr, readJson } from "@/lib/api";
import { all, one, nowIso } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type KeyRequestRow = {
  id: number;
  user_id: number;
  purpose: string | null;
  status: "pending" | "approved" | "denied";
  code: string | null;
  created_at: string;
  handled_at: string | null;
  nickname: string;
  avatar_color: string;
  role: string;
  handler_nickname: string | null;
};

const SELECT = `SELECT r.id, r.user_id, r.purpose, r.status, r.code, r.created_at, r.handled_at,
                       u.nickname, u.avatar_color, u.role, h.nickname AS handler_nickname
                  FROM key_requests r
                  JOIN users u ON u.id = r.user_id
                  LEFT JOIN users h ON h.id = r.handled_by`;

/** สมาชิกเห็นคำขอของตัวเอง · ผู้ดูแลเห็นคิวทั้งหมด */
export async function GET() {
  try {
    const user = await requireUser();
    const mine = await all<KeyRequestRow>(`${SELECT} WHERE r.user_id = ? ORDER BY r.id DESC LIMIT 20`, user.id);

    const queue = canModerate(user.role)
      ? await all<KeyRequestRow>(
          `${SELECT} WHERE r.status = 'pending' ORDER BY r.id ASC LIMIT 50`,
        )
      : [];

    return json({ mine, queue, canModerate: canModerate(user.role) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    await rateLimit(`key-request:${user.id}`, 3, 86400);

    const body = await readJson<{ purpose?: string }>(req);
    const pending = await one("SELECT id FROM key_requests WHERE user_id = ? AND status = 'pending'", user.id);
    if (pending) throw new ApiError(400, "คุณมีคำขอที่รออนุมัติอยู่แล้ว");

    const purpose = optionalStr(body.purpose, 300);
    const res = await one<{ id: number }>(
      "INSERT INTO key_requests (user_id, purpose, status, created_at) VALUES (?, ?, 'pending', ?) RETURNING id",
      user.id,
      purpose,
      nowIso(),
    );
    if (!res) throw new ApiError(500, "ส่งคำขอไม่สำเร็จ");

    return json({ ok: true, id: res.id });
  } catch (error) {
    return fail(error);
  }
}
