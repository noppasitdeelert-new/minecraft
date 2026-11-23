import { fail, intParam, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { joinLanRoom, leaveLanRoom } from "@/lib/lan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await joinLanRoom(user, intParam(id, "รหัสห้อง"));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await leaveLanRoom(user, intParam(id, "รหัสห้อง"));
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
