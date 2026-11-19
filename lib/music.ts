import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { all, one, run, nowIso } from "./db";
import { ApiError } from "./api";

export const MUSIC_DIR = path.resolve(process.cwd(), process.env.MUSIC_DIR || "./data/music");
export const MAX_BYTES = 60 * 1024 * 1024;
const AUDIUS_APP = process.env.AUDIUS_APP_NAME || "SKC105 Room Hub";
const FETCH_TIMEOUT_MS = 120_000;

export type Song = {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  artwork_url: string | null;
  duration_ms: number | null;
  source: string;
  mime: string;
  added_by_nickname: string | null;
  created_at: string;
  queue_status: string | null;
};

export type QueueEntry = {
  queue_id: number;
  song_id: number;
  title: string;
  artist: string;
  artwork_url: string | null;
  duration_ms: number | null;
  added_by_nickname: string | null;
  added_by_id: number | null;
  created_at: string;
};

const SONG_SELECT = `
  SELECT s.id, s.title, s.artist, s.album, s.artwork_url, s.duration_ms, s.source, s.mime, s.created_at,
         u.nickname AS added_by_nickname,
         (SELECT q.status FROM music_queue q WHERE q.song_id = s.id AND q.status != 'played' ORDER BY q.id LIMIT 1) AS queue_status
    FROM songs s LEFT JOIN users u ON u.id = s.added_by`;

export function listSongs(): Song[] {
  return all<Song>(`${SONG_SELECT} ORDER BY s.id DESC`);
}

export function listQueue(status: "pending" | "playing"): QueueEntry[] {
  return all<QueueEntry>(
    `SELECT q.id AS queue_id, s.id AS song_id, s.title, s.artist, s.artwork_url, s.duration_ms,
            q.created_at, q.added_by AS added_by_id, u.nickname AS added_by_nickname
       FROM music_queue q JOIN songs s ON s.id = q.song_id LEFT JOIN users u ON u.id = q.added_by
      WHERE q.status = ? ORDER BY q.id ASC`,
    status,
  );
}

export function recentlyPlayed(limit = 6): QueueEntry[] {
  return all<QueueEntry>(
    `SELECT q.id AS queue_id, s.id AS song_id, s.title, s.artist, s.artwork_url, s.duration_ms,
            q.created_at, q.added_by AS added_by_id, u.nickname AS added_by_nickname
       FROM music_queue q JOIN songs s ON s.id = q.song_id LEFT JOIN users u ON u.id = q.added_by
      WHERE q.status = 'played' ORDER BY q.played_at DESC LIMIT ?`,
    limit,
  );
}

type PlayingRow = { queue_id: number; started_at: string | null; duration_ms: number | null };

function playingRow(): PlayingRow | null {
  return one<PlayingRow>(
    `SELECT q.id AS queue_id, q.started_at, s.duration_ms
       FROM music_queue q JOIN songs s ON s.id = q.song_id
      WHERE q.status = 'playing' ORDER BY q.id LIMIT 1`,
  );
}

function promoteNext(): void {
  const next = one<{ id: number }>("SELECT id FROM music_queue WHERE status = 'pending' ORDER BY id LIMIT 1");
  if (next) run("UPDATE music_queue SET status = 'playing', started_at = ? WHERE id = ?", nowIso(), next.id);
}

/**
 * Finish the current track when the server knows its length, then start the
 * next queued song. Everyone's browser reads the same started_at, so the whole
 * room hears the queue in sync. Unknown durations are advanced by the player's
 * "ended" event instead.
 */
export function advanceIfFinished(): void {
  const playing = playingRow();
  if (playing) {
    const duration = playing.duration_ms ?? 0;
    if (!duration) return;
    const started = playing.started_at ? new Date(playing.started_at).getTime() : Date.now();
    if (Date.now() - started < duration + 1200) return;
    run("UPDATE music_queue SET status = 'played', played_at = ? WHERE id = ?", nowIso(), playing.queue_id);
  }
  promoteNext();
}

export function musicState() {
  advanceIfFinished();
  const current = listQueue("playing")[0] ?? null;
  return {
    current: current ? { ...current, started_at: playingRow()?.started_at ?? nowIso() } : null,
    queue: listQueue("pending"),
    history: recentlyPlayed(),
  };
}

export function skipCurrent(): void {
  const playing = playingRow();
  if (playing) run("UPDATE music_queue SET status = 'played', played_at = ? WHERE id = ?", nowIso(), playing.queue_id);
  promoteNext();
}

export function addToQueue(songId: number, userId: number): number {
  const song = one<{ id: number }>("SELECT id FROM songs WHERE id = ?", songId);
  if (!song) throw new ApiError(404, "ไม่พบเพลงนี้ในคลัง");
  const already = one<{ id: number }>(
    "SELECT id FROM music_queue WHERE song_id = ? AND status IN ('pending', 'playing')",
    songId,
  );
  if (already) throw new ApiError(409, "เพลงนี้อยู่ในคิวแล้ว");
  const res = run("INSERT INTO music_queue (song_id, added_by, status, created_at) VALUES (?, ?, 'pending', ?)", songId, userId, nowIso());
  return res.lastInsertRowid;
}

/* ------------------------------------------------------------------ */
/*  Downloading / importing full songs                                 */
/* ------------------------------------------------------------------ */

const PRIVATE_HOSTS = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)/i;

function assertRemoteUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(400, "ลิงก์ไฟล์เสียงไม่ถูกต้อง");
  }
  if (url.protocol !== "https:") throw new ApiError(400, "อนุญาตเฉพาะลิงก์ https เท่านั้น");
  if (PRIVATE_HOSTS.test(url.hostname) || url.hostname.endsWith(".local")) {
    throw new ApiError(400, "ไม่อนุญาตให้ดึงไฟล์จากที่อยู่อุปกรณ์ภายใน");
  }
  return url;
}

function extensionFor(mime: string, url: string): string {
  const m = mime.toLowerCase();
  if (m.includes("mpeg")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("wav")) return "wav";
  if (m.includes("flac")) return "flac";
  if (m.includes("webm")) return "webm";
  if (m.includes("flac")) return "flac";
  const ext = path.extname(new URL(url).pathname).replace(".", "").toLowerCase();
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : "bin";
}

export type ImportInput = {
  source: "audius" | "archive" | "url" | "upload" | "itunes";
  sourceKey: string;
  title: string;
  artist: string;
  album?: string | null;
  artworkUrl?: string | null;
  audioUrl: string;
  durationMs?: number | null;
};

async function storeAudio(input: ImportInput, userId: number): Promise<{ song: Song; created: boolean }> {
  const existing = one<{ id: number }>("SELECT id FROM songs WHERE source_id = ?", input.sourceKey);
  if (existing) {
    const song = one<Song>(`${SONG_SELECT} WHERE s.id = ?`, existing.id);
    if (song) return { song, created: false };
  }

  const url = assertRemoteUrl(input.audioUrl);
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "SKC105-RoomHub/1.0", Accept: "audio/*,*/*" },
    });
  } catch {
    throw new ApiError(502, "ดาวน์โหลดไฟล์เพลงไม่สำเร็จ กรุณาลองใหม่");
  }
  if (!res.ok) throw new ApiError(502, `ต้นทางตอบกลับ HTTP ${res.status}`);

  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) throw new ApiError(413, "ไฟล์เพลงใหญ่เกิน 60 MB");

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 10_000) throw new ApiError(502, "ไฟล์เพลงที่ได้เสียหายหรือสั้นเกินไป");
  if (buffer.length > MAX_BYTES) throw new ApiError(413, "ไฟล์เพลงใหญ่เกิน 60 MB");

  const contentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const isAudio =
    contentType.startsWith("audio/") ||
    contentType === "application/octet-stream" ||
    contentType === "binary/octet-stream";
  if (!isAudio) throw new ApiError(415, "ลิงก์นี้ไม่ใช่ไฟล์เสียง");

  const mime = contentType.startsWith("audio/") ? contentType : "audio/mpeg";
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
  const hash = crypto.createHash("sha1").update(input.sourceKey).digest("hex").slice(0, 24);
  const filePath = path.join(MUSIC_DIR, `${hash}.${extensionFor(mime, input.audioUrl)}`);
  fs.writeFileSync(filePath, buffer);

  const inserted = run(
    `INSERT INTO songs (title, artist, album, artwork_url, file_path, duration_ms, source_id, source, mime, added_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.title,
    input.artist,
    input.album ?? null,
    input.artworkUrl ?? null,
    filePath,
    input.durationMs ?? null,
    input.sourceKey,
    input.source,
    mime,
    userId,
    nowIso(),
  );

  const song = one<Song>(`${SONG_SELECT} WHERE s.id = ?`, inserted.lastInsertRowid);
  if (!song) throw new ApiError(500, "บันทึกเพลงไม่สำเร็จ");
  return { song, created: true };
}

export function importSong(input: ImportInput, userId: number) {
  return storeAudio(input, userId);
}

/** Store a file the admin uploaded directly (they are responsible for its licence). */
export function saveUploadedSong(
  data: Buffer,
  meta: { title: string; artist: string; album?: string | null; mime: string; durationMs?: number | null },
  userId: number,
): { song: Song; created: boolean } {
  if (data.length < 5_000) throw new ApiError(400, "ไฟล์เสียงสั้นเกินไป");
  if (data.length > MAX_BYTES) throw new ApiError(413, "ไฟล์เพลงใหญ่เกิน 60 MB");
  const mime = meta.mime.startsWith("audio/") ? meta.mime : "audio/mpeg";
  const sourceKey = `upload:${crypto.createHash("sha1").update(data).digest("hex").slice(0, 20)}`;
  const existing = one<{ id: number }>("SELECT id FROM songs WHERE source_id = ?", sourceKey);
  if (existing) {
    const song = one<Song>(`${SONG_SELECT} WHERE s.id = ?`, existing.id);
    if (song) return { song, created: false };
  }

  fs.mkdirSync(MUSIC_DIR, { recursive: true });
  const filePath = path.join(MUSIC_DIR, `${crypto.randomBytes(12).toString("hex")}.${extensionFor(mime, sourceKey)}`);
  fs.writeFileSync(filePath, data);
  const inserted = run(
    `INSERT INTO songs (title, artist, album, artwork_url, file_path, duration_ms, source_id, source, mime, added_by, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, 'upload', ?, ?, ?)`,
    meta.title,
    meta.artist,
    meta.album ?? null,
    filePath,
    meta.durationMs ?? null,
    sourceKey,
    mime,
    userId,
    nowIso(),
  );
  const song = one<Song>(`${SONG_SELECT} WHERE s.id = ?`, inserted.lastInsertRowid);
  if (!song) throw new ApiError(500, "บันทึกเพลงไม่สำเร็จ");
  return { song, created: true };
}

export function deleteSong(songId: number): void {
  const song = one<{ file_path: string }>("SELECT file_path FROM songs WHERE id = ?", songId);
  if (!song) throw new ApiError(404, "ไม่พบเพลงนี้");
  run("DELETE FROM songs WHERE id = ?", songId);
  const resolved = path.resolve(song.file_path);
  if (resolved.startsWith(MUSIC_DIR + path.sep)) {
    try {
      fs.unlinkSync(resolved);
    } catch {
      /* file already gone */
    }
  }
}

export function songFile(songId: number): { path: string; title: string; artist: string; mime: string } {
  const song = one<{ file_path: string; title: string; artist: string; mime: string }>(
    "SELECT file_path, title, artist, mime FROM songs WHERE id = ?",
    songId,
  );
  if (!song) throw new ApiError(404, "ไม่พบเพลงนี้");
  const resolved = path.resolve(song.file_path);
  if (!resolved.startsWith(MUSIC_DIR + path.sep) || !fs.existsSync(resolved)) {
    throw new ApiError(404, "ไม่พบไฟล์เพลงนี้ในเซิร์ฟเวอร์");
  }
  return { path: resolved, title: song.title, artist: song.artist, mime: song.mime || "audio/mpeg" };
}

export function setDuration(songId: number, durationMs: number): void {
  run("UPDATE songs SET duration_ms = ? WHERE id = ?", Math.round(durationMs), songId);
}

/* ------------------------------------------------------------------ */
/*  Audius (full-length independent music)                             */
/* ------------------------------------------------------------------ */

let audiusHostCache: { url: string; at: number } | null = null;

async function audiusHost(): Promise<string> {
  if (audiusHostCache && Date.now() - audiusHostCache.at < 6 * 3600_000) return audiusHostCache.url;
  try {
    const res = await fetch("https://api.audius.co", { signal: AbortSignal.timeout(10_000) });
    const data = (await res.json()) as { data?: string[] };
    const url = data.data?.[0];
    if (!url) throw new Error("no host");
    audiusHostCache = { url, at: Date.now() };
    return url;
  } catch {
    audiusHostCache = { url: "https://api.audius.co", at: Date.now() };
    return "https://api.audius.co";
  }
}

type AudiusTrack = {
  id: string;
  title?: string;
  duration?: number;
  is_streamable?: boolean;
  artwork?: { "480x480"?: string; "150x150"?: string };
  user?: { name?: string };
  genre?: string;
  mood?: string;
};

export function audiusStreamUrl(trackId: string): string {
  return `https://api.audius.co/v1/tracks/${encodeURIComponent(trackId)}/stream?app_name=${encodeURIComponent(AUDIUS_APP)}`;
}

export async function searchAudius(query: string): Promise<Array<Record<string, unknown>>> {
  const host = await audiusHost();
  const url = `${host}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${encodeURIComponent(AUDIUS_APP)}&limit=12`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: AudiusTrack[] };
  return (data.data ?? [])
    .filter((t) => t.is_streamable !== false && t.title)
    .map((t) => ({
      source: "audius",
      sourceKey: t.id,
      title: t.title,
      artist: t.user?.name ?? "Audius Artist",
      album: t.genre ?? null,
      artworkUrl: t.artwork?.["480x480"] ?? t.artwork?.["150x150"] ?? null,
      durationMs: t.duration ? t.duration * 1000 : null,
      audioUrl: audiusStreamUrl(t.id),
      license: "Audius (ศิลปินอิสระ)",
    }));
}

/* ------------------------------------------------------------------ */
/*  Internet Archive (public domain / Creative Commons, any language)  */
/* ------------------------------------------------------------------ */

export async function searchArchive(query: string): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams();
  params.set("q", `${query} AND mediatype:(audio)`);
  params.set("rows", "10");
  params.set("page", "1");
  params.set("output", "json");
  for (const field of ["identifier", "title", "creator", "language", "year"]) params.append("fl[]", field);
  params.append("sort[]", "downloads desc");

  const res = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    response?: { docs?: Array<{ identifier?: string; title?: string; creator?: string | string[]; language?: string | string[]; year?: string }> };
  };
  return (data.response?.docs ?? [])
    .filter((d) => d.identifier && d.title)
    .map((d) => ({
      source: "archive",
      sourceKey: d.identifier as string,
      title: d.title as string,
      artist: Array.isArray(d.creator) ? d.creator[0] : (d.creator ?? "Internet Archive"),
      album: Array.isArray(d.language) ? d.language[0] : (d.language ?? d.year ?? null),
      artworkUrl: `https://archive.org/services/img/${d.identifier}`,
      durationMs: null,
      audioUrl: null,
      license: "Public domain / Creative Commons",
    }));
}

type ArchiveMetadata = {
  metadata?: { title?: string; creator?: string | string[]; licenseurl?: string };
  files?: Array<{ name?: string; format?: string; size?: string; length?: string }>;
};

/** Resolve an archive.org item to a single playable audio file. */
export async function resolveArchive(identifier: string): Promise<{
  audioUrl: string;
  title: string;
  artist: string;
  durationMs: number | null;
  license: string | null;
}> {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(identifier)) throw new ApiError(400, "ชื่อคอลเลกชันไม่ถูกต้อง");
  const res = await fetch(`https://archive.org/metadata/${identifier}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new ApiError(502, "ดึงข้อมูลจาก Internet Archive ไม่สำเร็จ");
  const data = (await res.json()) as ArchiveMetadata;

  const candidates = (data.files ?? [])
    .filter((f) => f.name && /\.(mp3|ogg|m4a|opus|wav)$/i.test(f.name))
    .filter((f) => Number(f.size || 0) === 0 || Number(f.size) <= MAX_BYTES)
    .sort((a, b) => {
      const rank = (format?: string) => {
        const f = (format || "").toLowerCase();
        if (f.includes("vbr mp3")) return 0;
        if (f.includes("mp3")) return 1;
        if (f.includes("ogg")) return 2;
        if (f.includes("m4a")) return 3;
        return 4;
      };
      return rank(a.format) - rank(b.format) || Number(b.size || 0) - Number(a.size || 0);
    });
  const file = candidates[0];
  if (!file) throw new ApiError(404, "ไม่พบไฟล์เสียงที่เล่นได้ในรายการนี้");

  const creator = data.metadata?.creator;
  const length = Number(file.length || 0);
  return {
    audioUrl: `https://archive.org/download/${identifier}/${encodeURIComponent(file.name as string)}`,
    title: data.metadata?.title || identifier,
    artist: (Array.isArray(creator) ? creator[0] : creator) || "Internet Archive",
    durationMs: Number.isFinite(length) && length > 0 ? Math.round(length * 1000) : null,
    license: data.metadata?.licenseurl ?? null,
  };
}
