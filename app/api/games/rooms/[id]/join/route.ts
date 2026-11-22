import { fail, intParam, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { joinRoom, roomView } from "@/lib/gamerooms";
import { publishLobbyPulse, publishRoomPulse } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const id = intParam((await ctx.params).id, "id");
    await joinRoom(user, id);
    const view = await roomView(user, id);
    await Promise.all([
      publishRoomPulse(id, { status: view.status, turnSeat: view.turnSeat, moveCount: view.moveCount }),
      publishLobbyPulse(),
    ]);
    return json({ ok: true, room: view });
  } catch (error) {
    return fail(error);
  }
}
