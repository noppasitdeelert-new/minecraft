import { fail } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { songObject } from "@/lib/music";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const { object, file, range } = await songObject(Number(id), req.headers.get("range"));

    const headers = new Headers({
      "Content-Type": file.mime,
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.title)}`,
    });
    if (object.httpEtag) headers.set("ETag", object.httpEtag);

    if (range) {
      headers.set("Content-Length", String(range.length));
      headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${file.size}`);
      return new Response(object.body, { status: 206, headers });
    }

    headers.set("Content-Length", String(object.size ?? file.size));
    return new Response(object.body, { status: 200, headers });
  } catch (error) {
    return fail(error);
  }
}
