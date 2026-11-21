import { ApiError, fail, json, readJson } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import {
  KEYLINK_DEFAULT_LIMIT,
  KEYLINK_MAX_DOMAINS,
  KEYLINK_MAX_LIMIT,
  keyLinkStats,
  keyPoolState,
  loadKeyLinkConfig,
  normalizeDomain,
  parseDomains,
  recentAdminJobs,
  saveKeyLinkConfig,
} from "@/lib/keylink";
import { logAudit } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireManager();
    const [config, stats, pool, recent] = await Promise.all([
      loadKeyLinkConfig(),
      keyLinkStats(),
      keyPoolState(),
      recentAdminJobs(20),
    ]);

    return json({
      ...config,
      defaults: { dailyLimit: KEYLINK_DEFAULT_LIMIT, maxLimit: KEYLINK_MAX_LIMIT, maxDomains: KEYLINK_MAX_DOMAINS },
      stats,
      pool,
      recent,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(req: Request) {
  try {
    const admin = await requireManager();
    const body = await readJson<{ enabled?: boolean; dailyLimit?: number; domains?: unknown }>(req);

    const rawDomains = Array.isArray(body.domains)
      ? body.domains
      : typeof body.domains === "string"
        ? body.domains.split(/[\s,]+/)
        : [];
    const cleaned: string[] = [];
    for (const item of rawDomains) {
      if (typeof item !== "string" || !item.trim()) continue;
      const host = normalizeDomain(item);
      if (!host) throw new ApiError(400, `โดเมนไม่ถูกต้อง: ${item}`);
      cleaned.push(host);
    }
    if (cleaned.length > KEYLINK_MAX_DOMAINS) {
      throw new ApiError(400, `เพิ่มโดเมนได้สูงสุด ${KEYLINK_MAX_DOMAINS} รายการ`);
    }

    const config = await saveKeyLinkConfig({
      enabled: body.enabled !== false,
      dailyLimit: Number(body.dailyLimit ?? KEYLINK_DEFAULT_LIMIT),
      domains: cleaned,
    });

    await logAudit(
      admin.id,
      "keylink.settings",
      "settings:keylink",
      `${config.enabled ? "เปิด" : "ปิด"}ฟีเจอร์ · ${config.dailyLimit} ครั้ง/วัน · โดเมนเสริม ${
        parseDomains(config.extraDomains.join(",")).join(", ") || "ไม่มี"
      }`,
    );

    return json({ ok: true, ...config });
  } catch (error) {
    return fail(error);
  }
}
