import { ApiError, fail, json, readJson, str } from "@/lib/api";
import { hashPassword, one, run, verifyPassword, nowIso } from "@/lib/db";
import { createSession, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";
import { availableTitles, levelFromXp } from "@/lib/levels";
import { grantedTitles } from "@/lib/xp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_AVATAR_CHARS = 400_000; // ~300 KB binary after base64

/** Update my own profile (name, colour, avatar, bio, title) or rotate my password. */
export async function PATCH(req: Request) {
  try {
    const me = await requireUser();
    const body = await readJson<{
      nickname?: unknown;
      avatarColor?: unknown;
      avatarUrl?: unknown;
      bio?: unknown;
      title?: unknown;
      currentPassword?: unknown;
      newPassword?: unknown;
    }>(req);

    const changes: string[] = [];

    if (body.nickname !== undefined) {
      const next = str(body.nickname, "ชื่อเล่น", 24);
      if (next.length < 2) throw new ApiError(400, "ชื่อเล่นต้องมีอย่างน้อย 2 ตัวอักษร");
      if (next !== me.nickname) {
        const taken = await one<{ id: number }>(
          "SELECT id FROM users WHERE nickname = ? COLLATE NOCASE AND id != ?",
          next,
          me.id,
        );
        if (taken) throw new ApiError(409, "ชื่อเล่นนี้มีคนใช้แล้ว กรุณาเลือกชื่ออื่น");
        await run("UPDATE users SET nickname = ? WHERE id = ?", next, me.id);
        changes.push(`ชื่อเล่น: ${me.nickname} → ${next}`);
      }
    }

    if (body.avatarColor !== undefined) {
      const color = str(body.avatarColor, "สีโปรไฟล์", 7);
      if (!COLOR_RE.test(color)) throw new ApiError(400, "สีโปรไฟล์ต้องเป็นรหัสสี HEX เช่น #6366f1");
      if (color.toLowerCase() !== me.avatar_color.toLowerCase()) {
        await run("UPDATE users SET avatar_color = ? WHERE id = ?", color.toLowerCase(), me.id);
        changes.push(`สีโปรไฟล์: ${color.toLowerCase()}`);
      }
    }

    if (body.avatarUrl !== undefined) {
      const raw = typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : "";
      if (!raw) {
        await run("UPDATE users SET avatar_url = NULL WHERE id = ?", me.id);
        changes.push("ลบรูปโปรไฟล์");
      } else {
        const isData = /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(raw);
        const isHttp = /^https?:\/\/.+/i.test(raw);
        if (!isData && !isHttp) throw new ApiError(400, "รูปโปรไฟล์ต้องเป็นไฟล์รูปภาพหรือลิงก์ http(s)");
        if (raw.length > MAX_AVATAR_CHARS) throw new ApiError(413, "รูปโปรไฟล์ใหญ่เกินไป (สูงสุด ~300 KB)");
        await run("UPDATE users SET avatar_url = ? WHERE id = ?", raw, me.id);
        changes.push("อัปเดตรูปโปรไฟล์");
      }
    }

    if (body.bio !== undefined) {
      const raw = typeof body.bio === "string" ? body.bio.trim() : "";
      if (raw.length > 140) throw new ApiError(400, "คำคม/สถานะต้องไม่เกิน 140 ตัวอักษร");
      const next = raw || null;
      if (next !== me.bio) {
        await run("UPDATE users SET bio = ? WHERE id = ?", next, me.id);
        changes.push(next ? `คำคม: ${next}` : "ลบคำคม");
      }
    }

    if (body.title !== undefined) {
      const raw = typeof body.title === "string" ? body.title.trim() : "";
      const level = levelFromXp(me.xp);
      const allowed = availableTitles(level, await grantedTitles(me.id));
      if (raw && !allowed.includes(raw)) throw new ApiError(403, "ฉายานี้ยังไม่ถูกปลดล็อกสำหรับคุณ");
      const next = raw || null;
      if (next !== me.title) {
        await run("UPDATE users SET title = ? WHERE id = ?", next, me.id);
        changes.push(next ? `สวมฉายา: ${next}` : "ถอดฉายา");
      }
    }

    if (body.newPassword !== undefined) {
      const newPassword = str(body.newPassword, "รหัสผ่านใหม่", 200);
      if (newPassword.length < 8) throw new ApiError(400, "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");

      const stored = await one<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = ?", me.id);
      if (stored?.password_hash) {
        const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
        if (!currentPassword) throw new ApiError(400, "กรุณากรอกรหัสผ่านปัจจุบัน");
        if (!(await verifyPassword(currentPassword, stored.password_hash))) {
          throw new ApiError(400, "รหัสผ่านปัจจุบันไม่ถูกต้อง");
        }
      }

      await run("UPDATE users SET password_hash = ? WHERE id = ?", await hashPassword(newPassword), me.id);
      // Sign out every other device, then keep this tab signed in with a fresh session.
      await run("DELETE FROM sessions WHERE user_id = ?", me.id);
      await createSession(me.id, req.headers.get("user-agent"));
      changes.push("เปลี่ยนรหัสผ่าน (ออกจากระบบทุกอุปกรณ์อื่น)");
    }

    if (changes.length === 0) throw new ApiError(400, "ไม่มีข้อมูลที่ต้องบันทึก");
    await logAudit(me.id, "profile.update", `user:${me.id}`, changes.join(" · "));

    const updated = await one<Record<string, unknown>>("SELECT * FROM users WHERE id = ?", me.id);
    return json({
      ok: true,
      user: updated,
      passwordChanged: body.newPassword !== undefined,
      savedAt: nowIso(),
    });
  } catch (error) {
    return fail(error);
  }
}
