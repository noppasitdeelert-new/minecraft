import { fail, json } from "@/lib/api";
import { requireUser, canManage } from "@/lib/auth";
import { listSongs, musicState } from "@/lib/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return json({
      ...musicState(),
      songs: await listSongs(),
      canManage: canManage(user.role),
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    return fail(error);
  }
}
