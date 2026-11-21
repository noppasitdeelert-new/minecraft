import { fail, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { dailyUsage, keyPoolState, listHistory, loadKeyLinkConfig } from "@/lib/keylink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ตั้งค่าที่ผู้ใช้เห็น + ประวัติการปลดล็อกของตัวเอง */
export async function GET() {
  try {
    const user = await requireUser();
    const [config, usedToday, history, pool] = await Promise.all([
      loadKeyLinkConfig(),
      dailyUsage(user.id),
      listHistory(user.id),
      keyPoolState(),
    ]);

    return json({
      config: {
        enabled: config.enabled,
        dailyLimit: config.dailyLimit,
        extraDomains: config.extraDomains,
        usedToday,
        remaining: Math.max(0, config.dailyLimit - usedToday),
      },
      pool,
      history,
    });
  } catch (error) {
    return fail(error);
  }
}
