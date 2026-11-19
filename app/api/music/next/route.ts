import { fail, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { musicState, skipCurrent } from "@/lib/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Advance the room player to the next queued song. */
export async function POST() {
  try {
    await requireUser();
    skipCurrent();
    return json({ ok: true, ...musicState() });
  } catch (error) {
    return fail(error);
  }
}
