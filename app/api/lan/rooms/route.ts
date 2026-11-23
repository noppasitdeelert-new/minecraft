import { fail, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createLanRoom, lanState, type LanRoomInput } from "@/lib/lan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    return json(await lanState(user));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<LanRoomInput>(req);
    const created = await createLanRoom(user, body);
    return json({ ok: true, ...created }, 201);
  } catch (error) {
    return fail(error);
  }
}
