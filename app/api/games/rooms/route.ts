import { fail, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createRoom, lobbyState } from "@/lib/gamerooms";
import { publishLobbyPulse } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** รายการห้องที่เปิดรอคู่แข่ง + ห้องที่ฉันเล่นอยู่ + ตารางอันดับ + สถิติของฉัน */
export async function GET() {
  try {
    const user = await requireUser();
    const state = await lobbyState(user);
    return json(state);
  } catch (error) {
    return fail(error);
  }
}

/** สร้างห้องใหม่ (โหมดเล่นกับเพื่อน หรือซ้อมกับบอท) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ game?: unknown; mode?: unknown; turnSeconds?: unknown }>(req);
    const room = await createRoom(user, { game: body.game, mode: body.mode, turnSeconds: body.turnSeconds });
    await publishLobbyPulse();
    return json({ ok: true, id: room.id }, 201);
  } catch (error) {
    return fail(error);
  }
}
