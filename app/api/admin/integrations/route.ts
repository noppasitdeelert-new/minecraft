import { ApiError, fail, json, optionalStr, readJson, str } from "@/lib/api";
import { all, nowIso, run } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import {
  API_KEY_LIMIT,
  WEBHOOK_LIMIT,
  generateApiKey,
  listApiKeys,
  listWebhooks,
  logAudit,
  notifyChannels,
} from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireManager();
    return json({
      webhooks: listWebhooks(),
      keys: listApiKeys(),
      limits: { webhooks: WEBHOOK_LIMIT, apiKeys: API_KEY_LIMIT },
      counts: {
        webhooks: all("SELECT id FROM webhooks").length,
        apiKeys: all("SELECT id FROM api_keys WHERE revoked_at IS NULL").length,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

/** Create a webhook endpoint or an API key. */
export async function POST(req: Request) {
  try {
    const admin = await requireManager();
    const body = await readJson<{
      target?: string;
      name?: string;
      kind?: string;
      url?: string;
      secret?: string;
    }>(req);

    if (body.target === "api_key") {
      const name = str(body.name, "ชื่อคีย์", 80);
      const active = all("SELECT id FROM api_keys WHERE revoked_at IS NULL").length;
      if (active >= API_KEY_LIMIT) throw new ApiError(400, `สร้าง API Key ได้สูงสุด ${API_KEY_LIMIT} คีย์`);

      const generated = generateApiKey();
      run(
        "INSERT INTO api_keys (name, prefix, key_hash, enabled, created_by, created_at) VALUES (?, ?, ?, 1, ?, ?)",
        name,
        generated.prefix,
        generated.hash,
        admin.id,
        nowIso(),
      );
      logAudit(admin.id, "apikey.create", `apikey:${generated.prefix}`, `สร้าง API Key “${name}”`);
      return json({ ok: true, key: generated.key, prefix: generated.prefix });
    }

    const name = str(body.name, "ชื่อ Webhook", 80);
    const url = str(body.url, "Webhook URL", 500);
    const kind = ["discord", "line", "custom"].includes(String(body.kind)) ? String(body.kind) : "custom";
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ApiError(400, "URL ไม่ถูกต้อง");
    }
    if (!["https:", "http:"].includes(parsed.protocol)) throw new ApiError(400, "URL ต้องขึ้นต้นด้วย http หรือ https");

    const count = all("SELECT id FROM webhooks").length;
    if (count >= WEBHOOK_LIMIT) throw new ApiError(400, `เพิ่ม Webhook ได้สูงสุด ${WEBHOOK_LIMIT} รายการ`);

    run(
      "INSERT INTO webhooks (name, kind, url, secret, enabled, created_by, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
      name,
      kind,
      url,
      optionalStr(body.secret, 500),
      admin.id,
      nowIso(),
    );
    logAudit(admin.id, "webhook.create", `webhook:${name}`, `เพิ่ม Webhook ${kind} — ${parsed.host}`);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireManager();
    const body = await readJson<{ target?: string; id?: number; enabled?: boolean }>(req);
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "ไม่พบรายการที่ต้องการแก้ไข");
    const enabled = body.enabled ? 1 : 0;

    if (body.target === "api_key") {
      run("UPDATE api_keys SET enabled = ? WHERE id = ? AND revoked_at IS NULL", enabled, id);
      logAudit(admin.id, "apikey.toggle", `apikey:${id}`, enabled ? "เปิดใช้งาน API Key" : "ปิดใช้งาน API Key");
    } else {
      run("UPDATE webhooks SET enabled = ? WHERE id = ?", enabled, id);
      logAudit(admin.id, "webhook.toggle", `webhook:${id}`, enabled ? "เปิดใช้งาน Webhook" : "ปิดใช้งาน Webhook");
    }
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await requireManager();
    const params = new URL(req.url).searchParams;
    const id = Number(params.get("id") || 0);
    const target = params.get("target");
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, "ไม่พบรายการที่ต้องการลบ");

    if (target === "api_key") {
      run("UPDATE api_keys SET revoked_at = ?, enabled = 0 WHERE id = ?", nowIso(), id);
      logAudit(admin.id, "apikey.revoke", `apikey:${id}`, "เพิกถอน API Key");
    } else {
      run("DELETE FROM webhooks WHERE id = ?", id);
      logAudit(admin.id, "webhook.delete", `webhook:${id}`, "ลบ Webhook");
    }
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

/** Send a test message through every enabled webhook. */
export async function PUT(req: Request) {
  try {
    const admin = await requireManager();
    const body = await readJson<{ id?: number }>(req);
    const result = await notifyChannels(`🔔 ทดสอบการแจ้งเตือนจาก SKC105 Room Hub โดย ${admin.nickname}`);
    logAudit(admin.id, "webhook.test", `webhook:${body.id ?? "all"}`, `ส่งข้อความทดสอบ (สำเร็จ ${result.sent}, ล้มเหลว ${result.failed})`);
    return json({
      ok: true,
      ...result,
      message:
        result.sent === 0 && result.failed === 0
          ? "ยังไม่มี Webhook ที่เปิดใช้งาน"
          : `ส่งแล้ว ${result.sent} รายการ${result.failed ? ` · ล้มเหลว ${result.failed}` : ""}`,
    });
  } catch (error) {
    return fail(error);
  }
}
