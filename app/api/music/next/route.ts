import { fail, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { musicState, skipCurrent } from "@/lib/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Advance the room player to the next queued song. */
export async function POST() {
  try {
    await requireUser();
    await skipCurrent();
    return json({ ok: true, ...(await musicState()) });
  } catch (error) {
    return fail(error);
  }
}
