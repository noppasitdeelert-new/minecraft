import { fail, json, optionalStr, readJson } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { getSetting, logAudit, notifyChannels, setSetting, webhookConfig } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireManager();
    const config = await webhookConfig();
    return json({
      discord: config.discord,
      line: config.line,
      envDiscord: Boolean(process.env.DISCORD_WEBHOOK_URL),
      envLine: Boolean(process.env.LINE_WEBHOOK_URL),
      jitsi: process.env.JITSI_DOMAIN || "meet.jit.si",
      appUrl: process.env.APP_URL || "http://localhost:3000",
      seededAdmin: await getSetting("seeded") !== null,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(req: Request) {
  try {
    const admin = await requireManager();
    const body = await readJson<{ discord?: string; line?: string }>(req);
    await setSetting("webhook_discord", optionalStr(body.discord, 500));
    await setSetting("webhook_line", optionalStr(body.line, 500));
    await logAudit(admin.id, "settings.webhooks", "settings", "อัปเดต Webhook Discord / LINE");
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireManager();
    const body = await readJson<{ action?: string }>(req);
    if (body.action === "test") {
      await notifyChannels(`🔔 ทดสอบการแจ้งเตือนจาก SKC105 Room Hub โดย ${admin.nickname}`);
      return json({ ok: true, message: "ส่งข้อความทดสอบแล้ว (ตรวจสอบช่อง Discord / LINE ของคุณ)" });
    }
    return json({ ok: false }, 400);
  } catch (error) {
    return fail(error);
  }
}
