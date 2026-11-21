import { fail, intParam, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { joinRoom, roomView } from "@/lib/gamerooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const id = intParam((await ctx.params).id, "id");
    await joinRoom(user, id);
    return json({ ok: true, room: await roomView(user, id) });
  } catch (error) {
    return fail(error);
  }
}
