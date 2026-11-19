import { ApiError, fail, json, readJson, str } from "@/lib/api";
import { one, run, nowIso, verifyPassword } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await readJson<{ email?: string; password?: string }>(req);
    const email = str(body.email, "อีเมล", 160).toLowerCase();
    const password = str(body.password, "รหัสผ่าน", 200);

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
      password_hash: string | null;
    }>(
      "SELECT id, email, real_name, nickname, role, status, avatar_color, created_at, last_login_at, password_hash FROM users WHERE email = ?",
      email,
    );

    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new ApiError(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }
    if (user.status !== "active") throw new ApiError(403, "บัญชีนี้ถูกระงับการใช้งาน");

    run("UPDATE users SET last_login_at = ? WHERE id = ?", nowIso(), user.id);
    await createSession(user.id, req.headers.get("user-agent"));
    logAudit(user.id, "auth.login", `user:${user.id}`, "เข้าสู่ระบบด้วยรหัสผ่าน");

    const { password_hash: _ignored, ...safe } = user;
    return json({ ok: true, user: safe });
  } catch (error) {
    return fail(error);
  }
}
