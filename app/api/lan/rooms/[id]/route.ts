import { ApiError, fail, intParam, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { deleteLanRoom, updateLanRoom, type LanRoomInput } from "@/lib/lan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const roomId = intParam(id, "รหัสห้อง");
    const body = await readJson<LanRoomInput>(req);
    await updateLanRoom(user, roomId, body);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const roomId = intParam(id, "รหัสห้อง");
    if (!roomId) throw new ApiError(400, "รหัสห้องไม่ถูกต้อง");
    await deleteLanRoom(user, roomId);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
