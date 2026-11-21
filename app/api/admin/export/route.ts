import { ApiError, fail } from "@/lib/api";
import { all } from "@/lib/db";
import { canManage, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ตารางที่รวมอยู่ในไฟล์สำรอง — ตัดข้อมูลลับ (รหัสผ่าน, hash คีย์, โทเคนลิงก์) ออก */
const TABLES: string[] = [
  "users",
  "invite_keys",
  "key_requests",
  "channels",
  "messages",
  "message_reactions",
  "announcements",
  "announcement_reads",
  "meetings",
  "meeting_participants",
  "meeting_messages",
  "tasks",
  "task_status",
  "schedule_entries",
  "attendance",
  "polls",
  "poll_options",
  "poll_votes",
  "resources",
  "qa_posts",
  "qa_answers",
  "inventory_items",
  "inventory_loans",
  "gallery_photos",
  "xp_log",
  "user_titles",
  "user_badges",
  "rewards",
  "reward_redemptions",
  "songs",
  "music_queue",
  "webhooks",
  "settings",
  "audit_logs",
];

const OMIT: Record<string, string[]> = {
  users: ["password_hash"],
  webhooks: ["secret"],
};

/** ค่าตั้งค่าที่เป็นความลับ (URL เว็บฮุก) ไม่ถูกสำรองออกไป */
const SECRET_SETTINGS = new Set(["webhook_discord", "webhook_line"]);

export async function GET() {
  try {
    const user = await requireUser();
    if (!canManage(user.role)) throw new ApiError(403, "เฉพาะแอดมินเท่านั้น");

    const snapshot: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      exportedBy: { id: user.id, nickname: user.nickname },
      note: "ไฟล์สำรองข้อมูล SKC105 Room Hub — ไม่มีรหัสผ่าน/ความลับของระบบอยู่ข้างใน",
    };

    for (const table of TABLES) {
      const rows = await all<Record<string, unknown>>(`SELECT * FROM ${table}`).catch(() => []);
      const strip = OMIT[table] ?? [];
      snapshot[table] = rows
        .filter((row) => table !== "settings" || !SECRET_SETTINGS.has(String(row.key)))
        .map((row) => {
          if (strip.length === 0) return row;
          const copy: Record<string, unknown> = { ...row };
          for (const key of strip) delete copy[key];
          return copy;
        });
    }

    await logAudit(user.id, "system.export", "backup", `สำรองข้อมูล ${TABLES.length} ตาราง`);

    const filename = `skc105-backup-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(JSON.stringify(snapshot, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fail(error);
  }
}
