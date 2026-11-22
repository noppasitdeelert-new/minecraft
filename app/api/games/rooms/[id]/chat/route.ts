import { fail, intParam, json, readJson, str } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { sendChat } from "@/lib/gamerooms";
import { publishRoomPulse } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const id = intParam((await ctx.params).id, "id");
    const body = await readJson<{ body?: unknown }>(req);
    const text = str(body.body, "ข้อความ", 200);
    await sendChat(user, id, text);
    await publishRoomPulse(id);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
