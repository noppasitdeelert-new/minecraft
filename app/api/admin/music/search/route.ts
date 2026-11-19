import { fail, json } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { searchArchive, searchAudius } from "@/lib/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Search full-length audio sources (no 30-second previews):
 * - Audius: independent artists, full streaming tracks
 * - Internet Archive: public-domain / Creative Commons recordings, any language
 */
export async function GET(req: Request) {
  try {
    await requireManager();
    const params = new URL(req.url).searchParams;
    const q = (params.get("q") || "").trim().slice(0, 120);
    const only = params.get("source") || "all";
    if (!q) return json({ results: [] });

    const jobs: Array<Promise<Array<Record<string, unknown>>>> = [];
    if (only !== "archive") jobs.push(searchAudius(q).catch(() => []));
    if (only !== "audius") jobs.push(searchArchive(q).catch(() => []));

    const settled = await Promise.all(jobs);
    const results = settled.flat();
    return json({ results, query: q });
  } catch (error) {
    return fail(error);
  }
}
