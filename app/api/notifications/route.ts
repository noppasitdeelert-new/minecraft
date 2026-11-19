import { fail, json } from "@/lib/api";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight feed used by the browser-notification bell. */
export async function GET() {
  try {
    await requireUser();
    const announcements = await all<{ id: number; title: string; created_at: string }>(
      "SELECT id, title, created_at FROM announcements ORDER BY id DESC LIMIT 5",
    );
    const songs = await all<{ id: number; title: string; artist: string; created_at: string }>(
      "SELECT id, title, artist, created_at FROM songs ORDER BY id DESC LIMIT 3",
    );
    return json({ announcements, songs, serverTime: new Date().toISOString() });
  } catch (error) {
    return fail(error);
  }
}
