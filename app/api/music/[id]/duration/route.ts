import { fail, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { setDuration } from "@/lib/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_MS = 3000;
const MAX_MS = 3 * 3600_000;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const body = await readJson<{ duration_ms?: number }>(req);
    const duration = Number(body.duration_ms);
    if (!Number.isFinite(duration) || duration < MIN_MS || duration > MAX_MS) {
      return json({ ok: false }, 400);
    }
    setDuration(Number(id), duration);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
