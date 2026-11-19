import { fail, json } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { resolveArchive } from "@/lib/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireManager();
    const identifier = (new URL(req.url).searchParams.get("identifier") || "").trim();
    const resolved = await resolveArchive(identifier);
    return json({ ok: true, ...resolved });
  } catch (error) {
    return fail(error);
  }
}
