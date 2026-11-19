import { ApiError, fail, json } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";
import { addToQueue, MAX_BYTES, saveUploadedSong } from "@/lib/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upload an audio file from the admin's computer (any language / any filename). */
export async function POST(req: Request) {
  try {
    const admin = await requireManager();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "กรุณาเลือกไฟล์เสียง");
    if (file.size > MAX_BYTES) throw new ApiError(413, "ไฟล์เพลงใหญ่เกิน 60 MB");
    if (file.size < 5000) throw new ApiError(400, "ไฟล์เสียงสั้นเกินไป");

    const mime = file.type || "audio/mpeg";
    if (!mime.startsWith("audio/") && !/\.(mp3|m4a|ogg|wav|flac|opus|webm)$/i.test(file.name)) {
      throw new ApiError(415, "ไฟล์ที่เลือกไม่ใช่ไฟล์เสียง");
    }

    const rawTitle = String(form.get("title") || "").trim();
    const title = (rawTitle || file.name.replace(/\.[^.]+$/, "")).slice(0, 300) || "ไม่มีชื่อเพลง";
    const artist = (String(form.get("artist") || "").trim() || "ไม่ทราบศิลปิน").slice(0, 300);
    const album = String(form.get("album") || "").trim().slice(0, 200) || null;
    const duration = Number(form.get("durationMs") || 0);

    const data = Buffer.from(await file.arrayBuffer());
    const result = saveUploadedSong(
      data,
      { title, artist, album, mime, durationMs: Number.isFinite(duration) && duration > 0 ? duration : null },
      admin.id,
    );

    let queued = false;
    try {
      addToQueue(result.song.id, admin.id);
      queued = true;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
    }

    logAudit(admin.id, "music.upload", `song:${result.song.id}`, `อัปโหลดเพลง: ${artist} — ${title}`);
    return json({ ok: true, song: result.song, created: result.created, queued });
  } catch (error) {
    return fail(error);
  }
}
