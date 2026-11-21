import { fail, intParam, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { roomView } from "@/lib/gamerooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** สถานะกระดานล่าสุด — client เรียกซ้ำทุก ~1 วินาทีระหว่างเล่น (near real-time) */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const id = intParam((await ctx.params).id, "id");
    return json(await roomView(user, id));
  } catch (error) {
    return fail(error);
  }
}
