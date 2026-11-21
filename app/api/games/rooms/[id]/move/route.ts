import { ApiError, fail, intParam, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { playMove } from "@/lib/gamerooms";
import type { AnyMove } from "@/lib/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** เดินหมาก — ตรวจกติกาที่เซิร์ฟเวอร์ 100% (client ส่งได้แค่เจตนาเดิน) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const id = intParam((await ctx.params).id, "id");
    const body = await readJson<{ move?: AnyMove }>(req);
    if (!body.move || typeof body.move !== "object") throw new ApiError(400, "ไม่พบข้อมูลการเดินหมาก");
    const view = await playMove(user, id, body.move);
    return json(view);
  } catch (error) {
    return fail(error);
  }
}
