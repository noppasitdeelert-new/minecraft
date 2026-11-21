import { fail, json, readJson } from "@/lib/api";
import { all, run, nowIso } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** บันทึกว่า "อ่านแล้ว" — ไม่ระบุ id = ทำเครื่องหมายทั้งประกาศที่ยังไม่เคยอ่าน */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    await rateLimit(`announcement-read:${user.id}`, 60, 60);

    const body = await readJson<{ id?: number; all?: boolean }>(req);
    const now = nowIso();

    if (body.all) {
      await run(
        `INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id, created_at)
         SELECT id, ?, ? FROM announcements`,
        user.id,
        now,
      );
    } else {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return json({ ok: false }, 400);
      await run(
        "INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id, created_at) VALUES (?, ?, ?)",
        id,
        user.id,
        now,
      );
    }

    const rows = await all<{ announcement_id: number }>(
      "SELECT announcement_id FROM announcement_reads WHERE user_id = ?",
      user.id,
    );
    return json({ ok: true, readIds: rows.map((row) => Number(row.announcement_id)) });
  } catch (error) {
    return fail(error);
  }
}
