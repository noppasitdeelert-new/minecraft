import { ApiError, fail, json, readJson, str } from "@/lib/api";
import { nowIso, run } from "@/lib/db";
import { notifyChannels, resolveApiKey } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public machine-to-machine notification endpoint.
 * Authenticate with `Authorization: Bearer <api key>` created in /admin.
 */
export async function POST(req: Request) {
  try {
    const header = req.headers.get("authorization") || "";
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    const key = await resolveApiKey(token);
    if (!key) throw new ApiError(401, "API Key ไม่ถูกต้องหรือถูกเพิกถอนแล้ว");

    const body = await readJson<{ message?: string }>(req);
    const message = str(body.message, "ข้อความ", 1800);

    await run("UPDATE api_keys SET last_used_at = ? WHERE id = ?", nowIso(), key.id);
    const result = await notifyChannels(message);
    return json({ ok: true, message, ...result });
  } catch (error) {
    return fail(error);
  }
}
