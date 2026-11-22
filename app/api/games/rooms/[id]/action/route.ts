import { ApiError, fail, intParam, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { roomAction, type RoomAction } from "@/lib/gamerooms";
import { publishLobbyPulse, publishRoomPulse } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: RoomAction[] = ["resign", "offer-draw", "accept-draw", "decline-draw", "leave"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const id = intParam((await ctx.params).id, "id");
    const body = await readJson<{ action?: string }>(req);
    const action = ACTIONS.find((value) => value === body.action);
    if (!action) throw new ApiError(400, "ไม่รู้จักคำสั่งนี้");
    const result = await roomAction(user, id, action);
    if (result.closed) {
      await publishLobbyPulse();
      return json(result);
    }
    await publishRoomPulse(id, {
      status: result.view.status,
      turnSeat: result.view.turnSeat,
      winnerSeat: result.view.winnerSeat,
      result: result.view.result,
      resultNote: result.view.resultNote,
    });
    if (action === "leave" || result.view.status === "finished") await publishLobbyPulse();
    return json(result);
  } catch (error) {
    return fail(error);
  }
}
