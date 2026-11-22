import { ApiError, fail, json, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { createRealtimeTicket, LOBBY_ROOM, siteOrigin } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** รับเฉพาะ origin รูปแบบ http(s)://host[:port] เท่านั้น */
function normalizeOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin === value ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * ออกตั๋ว WebSocket (ใช้ครั้งเดียว, อายุ 30 วิ) ให้ผู้ที่ล็อกอินแล้วเท่านั้น
 * ตรวจสิทธิ์ห้องจากฐานข้อมูลก่อนเสมอ และไม่รับ userId/publish/origin จาก client
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ room?: unknown }>(req);
    const room = typeof body.room === "string" ? body.room.trim() : "";
    // ตั๋วผูกกับ origin ของเบราว์เซอร์ที่กำลังเชื่อมต่อ (helper จะเทียบกับโดเมนจริงอีกขั้น)
    // ถ้าไม่มี header นี้ (เช่นคำขอจากเซิร์ฟเวอร์) จึงใช้โดเมนที่ตั้งไว้ของเว็บ
    const sentOrigin = req.headers.get("origin");
    const origin = normalizeOrigin(sentOrigin) ?? (await siteOrigin(req));

    if (room !== LOBBY_ROOM) {
      const match = /^game:(\d{1,10})$/.exec(room);
      if (!match) throw new ApiError(400, "ห้องเรียลไทม์ไม่ถูกต้อง");
      const found = await one<{ id: number }>("SELECT id FROM game_rooms WHERE id = ?", Number(match[1]));
      if (!found) throw new ApiError(404, "ไม่พบห้องนี้");
    }

    const ticket = await createRealtimeTicket(room, String(user.id), origin);
    return json(ticket);
  } catch (error) {
    return fail(error);
  }
}
