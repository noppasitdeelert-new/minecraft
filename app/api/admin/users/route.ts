import { ApiError, fail, json, readJson } from "@/lib/api";
import { all, one, run } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { logAudit, notifyChannels } from "@/lib/integrations";
import { awardXp, grantedTitles } from "@/lib/xp";
import { availableTitles, levelFromXp } from "@/lib/levels";
import type { AdminMember } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireManager();
    const members = await all<AdminMember>(
      `SELECT u.id, u.email, u.real_name, u.nickname, u.role, u.status, u.avatar_color, u.avatar_url,
              u.xp, u.bio, u.title, u.created_at, u.last_login_at,
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
    const body = await readJson<{ id?: number; role?: string; status?: string; xpDelta?: number; title?: string }>(req);
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "ไม่พบสมาชิกที่ต้องการแก้ไข");

    const target = await one<{ id: number; nickname: string; role: string; status: string; xp: number; title: string | null }>(
      "SELECT id, nickname, role, status, xp, title FROM users WHERE id = ?",
      id,
    );
    if (!target) throw new ApiError(404, "ไม่พบสมาชิกนี้");
    // แอดมินสูงสุดแก้ XP/ฉายาของตัวเองได้ แต่ห้ามคนอื่นมาแก้บัญชีแอดมินสูงสุด
    if (target.role === "owner" && target.id !== admin.id) {
      throw new ApiError(403, "ไม่สามารถแก้ไขบัญชีแอดมินสูงสุดได้");
    }

    if (body.role !== undefined) {
      const role = String(body.role);
      if (!["admin", "moderator", "member"].includes(role)) throw new ApiError(400, "ยศไม่ถูกต้อง");
      if (admin.role !== "owner" && role === "admin") throw new ApiError(403, "เฉพาะแอดมินสูงสุดเท่านั้นที่ตั้งแอดมินได้");
      if (target.id === admin.id) throw new ApiError(400, "ไม่สามารถเปลี่ยนยศของตัวเองได้");
      await run("UPDATE users SET role = ? WHERE id = ?", role, id);
      await logAudit(admin.id, "user.role", `user:${id}`, `${target.nickname}: ${target.role} → ${role}`);
    }

    if (body.status !== undefined) {
      const status = String(body.status);
      if (!["active", "suspended"].includes(status)) throw new ApiError(400, "สถานะไม่ถูกต้อง");
      if (target.id === admin.id) throw new ApiError(400, "ไม่สามารถระงับบัญชีของตัวเองได้");
      await run("UPDATE users SET status = ? WHERE id = ?", status, id);
      if (status === "suspended") await run("DELETE FROM sessions WHERE user_id = ?", id);
      await logAudit(admin.id, "user.status", `user:${id}`, `${target.nickname}: ${status === "active" ? "เปิดใช้งาน" : "ระงับการใช้งาน"}`);
      void notifyChannels(
        status === "suspended"
          ? `⛔ บัญชี **${target.nickname}** ถูกระงับการใช้งานโดย ${admin.nickname}`
          : `✅ บัญชี **${target.nickname}** ถูกเปิดใช้งานโดย ${admin.nickname}`,
      );
    }

    if (body.xpDelta !== undefined) {
      const delta = Math.trunc(Number(body.xpDelta));
      if (!Number.isFinite(delta) || delta === 0) throw new ApiError(400, "ระบุแต้ม XP ที่จะปรับ (ติดลบได้)");
      if (Math.abs(delta) > 10000) throw new ApiError(400, "ปรับแต้มได้ครั้งละไม่เกิน 10,000 XP");
      await awardXp(id, delta, "admin.adjust", admin.id);
      await logAudit(admin.id, "user.xp", `user:${id}`, `${target.nickname}: ${delta > 0 ? "+" : ""}${delta} XP`);
    }

    if (body.title !== undefined) {
      const label = typeof body.title === "string" ? body.title.trim().slice(0, 40) : "";
      if (!label) {
        await run("UPDATE users SET title = NULL WHERE id = ?", id);
        await logAudit(admin.id, "user.title", `user:${id}`, `${target.nickname}: ถอดฉายา`);
      } else {
        const allowed = availableTitles(levelFromXp(target.xp), await grantedTitles(id));
        if (!allowed.includes(label)) {
          await run(
            "INSERT OR IGNORE INTO user_titles (user_id, label, granted_by, created_at) VALUES (?, ?, ?, ?)",
            id,
            label,
            admin.id,
            new Date().toISOString(),
          );
        }
        await run("UPDATE users SET title = ? WHERE id = ?", label, id);
        await logAudit(admin.id, "user.title", `user:${id}`, `${target.nickname}: ${label}`);
      }
    }

    const updated = await one<AdminMember>(
      `SELECT u.id, u.email, u.real_name, u.nickname, u.role, u.status, u.avatar_color, u.avatar_url,
              u.xp, u.bio, u.title, u.created_at, u.last_login_at,
              (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) AS message_count
         FROM users u WHERE u.id = ?`,
      id,
    );
    return json({ member: updated });
  } catch (error) {
    return fail(error);
  }
}
