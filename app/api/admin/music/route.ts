import { ApiError, fail, json, optionalStr, readJson, str } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";
import { addToQueue, audiusStreamUrl, deleteSong, importSong, listSongs, musicState, resolveArchive } from "@/lib/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireManager();
    return json({ songs: listSongs(), ...musicState() });
  } catch (error) {
    return fail(error);
  }
}

/** Download a full-length track into data/music and optionally queue it. */
export async function POST(req: Request) {
  try {
    const admin = await requireManager();
    const body = await readJson<{
      source?: string;
      sourceKey?: string;
      identifier?: string;
      url?: string;
      title?: string;
      artist?: string;
      album?: string;
      artworkUrl?: string;
      durationMs?: number;
      enqueue?: boolean;
    }>(req);

    const source = String(body.source ?? "audius");
    let result;

    if (source === "audius") {
      const trackId = str(body.sourceKey, "รหัสเพลง", 100);
      result = await importSong(
        {
          source: "audius",
          sourceKey: `audius:${trackId}`,
          title: str(body.title, "ชื่อเพลง", 300),
          artist: str(body.artist, "ศิลปิน", 300),
          album: optionalStr(body.album, 200),
          artworkUrl: optionalStr(body.artworkUrl, 800),
          audioUrl: audiusStreamUrl(trackId),
          durationMs: Number(body.durationMs) > 0 ? Number(body.durationMs) : null,
        },
        admin.id,
      );
    } else if (source === "archive") {
      const resolved = await resolveArchive(str(body.identifier ?? body.sourceKey, "รายการ", 120));
      result = await importSong(
        {
          source: "archive",
          sourceKey: `archive:${body.identifier ?? body.sourceKey}`,
          title: optionalStr(body.title, 300) ?? resolved.title,
          artist: optionalStr(body.artist, 300) ?? resolved.artist,
          album: resolved.license,
          artworkUrl: optionalStr(body.artworkUrl, 800) ?? `https://archive.org/services/img/${body.identifier ?? body.sourceKey}`,
          audioUrl: resolved.audioUrl,
          durationMs: resolved.durationMs,
        },
        admin.id,
      );
    } else if (source === "url") {
      result = await importSong(
        {
          source: "url",
          sourceKey: `url:${str(body.url, "ลิงก์ไฟล์เสียง", 1000)}`,
          title: str(body.title, "ชื่อเพลง", 300),
          artist: str(body.artist ?? "ไม่ทราบศิลปิน", "ศิลปิน", 300),
          album: optionalStr(body.album, 200),
          artworkUrl: optionalStr(body.artworkUrl, 800),
          audioUrl: str(body.url, "ลิงก์ไฟล์เสียง", 1000),
          durationMs: Number(body.durationMs) > 0 ? Number(body.durationMs) : null,
        },
        admin.id,
      );
    } else {
      throw new ApiError(400, "แหล่งเพลงไม่ถูกต้อง");
    }

    let queued = false;
    if (body.enqueue !== false) {
      try {
        addToQueue(result.song.id, admin.id);
        queued = true;
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error;
      }
    }

    logAudit(
      admin.id,
      "music.add",
      `song:${result.song.id}`,
      `${result.created ? "ดาวน์โหลด" : "มีอยู่แล้ว"} (${result.song.source}): ${result.song.artist} — ${result.song.title}${queued ? " (เข้าคิว)" : ""}`,
    );
    return json({ ok: true, song: result.song, created: result.created, queued });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await requireManager();
    const id = Number(new URL(req.url).searchParams.get("id") || 0);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "ไม่พบเพลงที่ต้องการลบ");
    deleteSong(id);
    logAudit(admin.id, "music.delete", `song:${id}`, "ลบเพลงออกจากคลัง");
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
