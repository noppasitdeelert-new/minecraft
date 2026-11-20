import { ApiError, fail, json, readJson, str } from "@/lib/api";
import { all, one, run, nowIso } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { askNox, hasGroqKey, type NoxMessage } from "@/lib/nox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_LIMIT = 80;
const HISTORY_LIMIT = 60;
const CONTEXT_LIMIT = 16;

type StoredMessage = { id: number; role: "user" | "assistant"; body: string; created_at: string };

/** Start of today in Asia/Bangkok, expressed as an ISO timestamp. */
function startOfBangkokDay(): string {
  const bkk = new Date(Date.now() + 7 * 3600_000);
  const utcDay = Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate());
  return new Date(utcDay - 7 * 3600_000).toISOString();
}

export async function GET() {
  try {
    const user = await requireUser();
    const messages = await all<StoredMessage>(
      "SELECT id, role, body, created_at FROM nox_messages WHERE user_id = ? ORDER BY id DESC LIMIT ?",
      user.id,
      HISTORY_LIMIT,
    );
    const usedToday = await one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM nox_messages WHERE user_id = ? AND role = 'user' AND created_at >= ?",
      user.id,
      startOfBangkokDay(),
    );

    return json({
      configured: hasGroqKey(),
      messages: messages.reverse(),
      remaining: Math.max(0, DAILY_LIMIT - Number(usedToday?.n ?? 0)),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!hasGroqKey()) {
      throw new ApiError(
        503,
        "Nox ยังไม่พร้อมใช้งาน — แอดมินต้องตั้งค่า GROQ_API_KEY ใน Sites → Secrets (หรือ .dev.vars สำหรับรันในเครื่อง)",
      );
    }

    const body = await readJson<{ message?: unknown }>(req);
    const text = str(body.message, "ข้อความ", 2000);

    const usedToday = await one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM nox_messages WHERE user_id = ? AND role = 'user' AND created_at >= ?",
      user.id,
      startOfBangkokDay(),
    );
    if (Number(usedToday?.n ?? 0) >= DAILY_LIMIT) {
      throw new ApiError(429, `วันนี้คุณคุยกับ Nox ครบ ${DAILY_LIMIT} ข้อความแล้ว พรุ่งนี้ค่อยคุยใหม่นะ`);
    }

    const now = nowIso();
    const inserted = await run(
      "INSERT INTO nox_messages (user_id, role, body, created_at) VALUES (?, 'user', ?, ?)",
      user.id,
      text,
      now,
    );

    const history = await all<{ role: string; body: string }>(
      "SELECT role, body FROM nox_messages WHERE user_id = ? ORDER BY id DESC LIMIT ?",
      user.id,
      CONTEXT_LIMIT,
    );
    const conversation: NoxMessage[] = history
      .reverse()
      .filter((row) => row.role === "user" || row.role === "assistant")
      .map((row) => ({ role: row.role as NoxMessage["role"], content: row.body }));

    let reply: string;
    try {
      reply = await askNox(conversation);
    } catch (error) {
      await run("DELETE FROM nox_messages WHERE id = ?", inserted.lastInsertRowid);
      throw new ApiError(502, error instanceof Error ? error.message : "Nox ตอบไม่ได้ในตอนนี้");
    }

    const assistant = await run(
      "INSERT INTO nox_messages (user_id, role, body, created_at) VALUES (?, 'assistant', ?, ?)",
      user.id,
      reply,
      nowIso(),
    );

    return json({
      userMessage: { id: inserted.lastInsertRowid, role: "user", body: text, created_at: now },
      reply: { id: assistant.lastInsertRowid, role: "assistant", body: reply, created_at: nowIso() },
      remaining: Math.max(0, DAILY_LIMIT - Number(usedToday?.n ?? 0) - 1),
    });
  } catch (error) {
    return fail(error);
  }
}

/** Clear my own conversation with Nox. */
export async function DELETE() {
  try {
    const user = await requireUser();
    await run("DELETE FROM nox_messages WHERE user_id = ?", user.id);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
