import fs from "node:fs";
import { fail } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { songFile } from "@/lib/music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const file = songFile(Number(id));
    const data = fs.readFileSync(file.path);
    return new Response(data, {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(data.length),
        "Cache-Control": "private, max-age=3600",
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.title)}`,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
