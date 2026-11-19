import { ApiError, fail, json, readJson } from "@/lib/api";
import { all, one, run } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { logAudit, notifyChannels } from "@/lib/integrations";
import type { AdminMember } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireManager();
    const members = all<AdminMember>(
      `SELECT u.id, u.email, u.real_name, u.nickname, u.role, u.status, u.avatar_color, u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) AS message_count
         FROM users u
        ORDER BY CASE u.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END, u.nickname COLLATE NOCASE`,
    );
    return json({ members });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireManager();
    const body = await readJson<{ id?: number; role?: string; status?: string }>(req);
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "ไม่พบสมาชิกที่ต้องการแก้ไข");

    const target = one<{ id: number; nickname: string; role: string; status: string }>(
      "SELECT id, nickname, role, status FROM users WHERE id = ?",
      id,
    );
    if (!target) throw new ApiError(404, "ไม่พบสมาชิกนี้");
    if (target.role === "owner") throw new ApiError(403, "ไม่สามารถแก้ไขบัญชีแอดมินสูงสุดได้");

    if (body.role !== undefined) {
      const role = String(body.role);
      if (!["admin", "moderator", "member"].includes(role)) throw new ApiError(400, "ยศไม่ถูกต้อง");
      if (admin.role !== "owner" && role === "admin") throw new ApiError(403, "เฉพาะแอดมินสูงสุดเท่านั้นที่ตั้งแอดมินได้");
      if (target.id === admin.id) throw new ApiError(400, "ไม่สามารถเปลี่ยนยศของตัวเองได้");
      run("UPDATE users SET role = ? WHERE id = ?", role, id);
      logAudit(admin.id, "user.role", `user:${id}`, `${target.nickname}: ${target.role} → ${role}`);
    }

    if (body.status !== undefined) {
      const status = String(body.status);
      if (!["active", "suspended"].includes(status)) throw new ApiError(400, "สถานะไม่ถูกต้อง");
      if (target.id === admin.id) throw new ApiError(400, "ไม่สามารถระงับบัญชีของตัวเองได้");
      run("UPDATE users SET status = ? WHERE id = ?", status, id);
      if (status === "suspended") run("DELETE FROM sessions WHERE user_id = ?", id);
      logAudit(admin.id, "user.status", `user:${id}`, `${target.nickname}: ${status === "active" ? "เปิดใช้งาน" : "ระงับการใช้งาน"}`);
      void notifyChannels(
        status === "suspended"
          ? `⛔ บัญชี **${target.nickname}** ถูกระงับการใช้งานโดย ${admin.nickname}`
          : `✅ บัญชี **${target.nickname}** ถูกเปิดใช้งานโดย ${admin.nickname}`,
      );
    }

    const updated = one<AdminMember>(
      `SELECT u.id, u.email, u.real_name, u.nickname, u.role, u.status, u.avatar_color, u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) AS message_count
         FROM users u WHERE u.id = ?`,
      id,
    );
    return json({ member: updated });
  } catch (error) {
    return fail(error);
  }
}
