import { ApiError, fail, json, readJson, str } from "@/lib/api";
import { one, run, nowIso, randomAvatarColor, hashPassword, db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { logAudit, notifyChannels } from "@/lib/integrations";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Password registration with a single-use room key.
 * The key is deleted in the same request that creates the account, so it can
 * never be reused — even if two people submit the same key at the same moment.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson<{
      key?: string;
      email?: string;
      realName?: string;
      nickname?: string;
      password?: string;
      confirmPassword?: string;
    }>(req);

    const key = str(body.key, "คีย์ห้อง", 64).toUpperCase();
    const email = str(body.email, "อีเมล", 160).toLowerCase();
    const realName = str(body.realName, "ชื่อจริง", 80);
    const nickname = str(body.nickname, "ชื่อเล่น", 24);
    const password = str(body.password, "รหัสผ่าน", 200);

    if (!EMAIL_RE.test(email)) throw new ApiError(400, "รูปแบบอีเมลไม่ถูกต้อง");
    if (realName.length < 2) throw new ApiError(400, "กรุณากรอกชื่อจริงให้ครบถ้วน");
    if (nickname.length < 2) throw new ApiError(400, "ชื่อเล่นต้องมีอย่างน้อย 2 ตัวอักษร");
    if (password.length < 8) throw new ApiError(400, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร");
    if (typeof body.confirmPassword === "string" && body.confirmPassword !== password) {
      throw new ApiError(400, "รหัสผ่านทั้งสองช่องไม่ตรงกัน");
    }

    const invite = one<{ id: number; used_at: string | null }>("SELECT id, used_at FROM invite_keys WHERE code = ?", key);
    if (!invite) throw new ApiError(400, "คีย์ห้องไม่ถูกต้อง หรือถูกใช้ไปแล้ว");
    if (invite.used_at) throw new ApiError(400, "คีย์ห้องนี้ถูกใช้สมัครไปแล้ว กรุณาขอคีย์ใหม่จากแอดมิน");

    const existing = one<{ id: number }>("SELECT id FROM users WHERE email = ?", email);
    if (existing) throw new ApiError(409, "อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบแทน");

    // Single-use guarantee: remove the key before the account row is written.
    const removed = run("DELETE FROM invite_keys WHERE code = ? AND used_at IS NULL", key);
    if (removed.changes !== 1) throw new ApiError(409, "คีย์ห้องถูกใช้ไปแล้ว กรุณาขอคีย์ใหม่จากแอดมิน");

    let userId = 0;
    try {
      const created = run(
        "INSERT INTO users (email, real_name, nickname, role, status, password_hash, avatar_color, created_at, last_login_at) VALUES (?, ?, ?, 'member', 'active', ?, ?, ?, ?)",
        email,
        realName,
        nickname,
        hashPassword(password),
        randomAvatarColor(),
        nowIso(),
        nowIso(),
      );
      userId = created.lastInsertRowid;
    } catch {
      // Restore the key so a failed insert never burns an invitation.
      db.prepare("INSERT OR IGNORE INTO invite_keys (code, note, created_at) VALUES (?, ?, ?)").run(
        key,
        "กู้คืนอัตโนมัติจากการสมัครที่ไม่สำเร็จ",
        nowIso(),
      );
      throw new ApiError(500, "สร้างบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }

    logAudit(userId, "auth.register", `user:${userId}`, `สมัครสมาชิกด้วยคีย์ ${key} (คีย์ถูกลบแล้ว)`);
    void notifyChannels(`👋 สมาชิกใหม่เข้าห้อง: **${nickname}** (${realName})`);

    const user = one<{
      id: number;
      email: string;
      real_name: string;
      nickname: string;
      role: string;
      status: string;
      avatar_color: string;
      created_at: string;
      last_login_at: string | null;
    }>("SELECT id, email, real_name, nickname, role, status, avatar_color, created_at, last_login_at FROM users WHERE id = ?", userId);

    await createSession(userId, req.headers.get("user-agent"));
    return json({ ok: true, user });
  } catch (error) {
    return fail(error);
  }
}
