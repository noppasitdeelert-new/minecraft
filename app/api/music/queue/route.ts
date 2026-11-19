import { ApiError, fail, json, readJson } from "@/lib/api";
import { canManage, requireUser } from "@/lib/auth";
import { one, run } from "@/lib/db";
import { addToQueue } from "@/lib/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ song_id?: number }>(req);
    const songId = Number(body.song_id);
    if (!Number.isInteger(songId) || songId <= 0) throw new ApiError(400, "เพลงไม่ถูกต้อง");
    const queueId = await addToQueue(songId, user.id);
    return json({ ok: true, queue_id: queueId });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = Number(new URL(req.url).searchParams.get("id") || 0);
    const item = await one<{ id: number; added_by: number | null; status: string }>(
      "SELECT id, added_by, status FROM music_queue WHERE id = ?",
      id,
    );
    if (!item) throw new ApiError(404, "ไม่พบเพลงในคิว");
    if (!canManage(user.role) && item.added_by !== user.id) {
      throw new ApiError(403, "ลบได้เฉพาะเพลงที่ตัวเองเพิ่ม หรือให้แอดมินลบให้");
    }
    if (item.status === "playing") throw new ApiError(400, "เพลงที่กำลังเล่นอยู่ใช้ปุ่ม “ข้ามเพลง” แทน");
    await run("DELETE FROM music_queue WHERE id = ?", id);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
