import { ApiError, fail, json, optionalStr, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { LINK_REASON_TEXT, SHARE_STATUS_TEXT, inspectLink, loadKeyLinkConfig } from "@/lib/keylink";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ตรวจลิงก์ก่อนปลดล็อก — ไม่กินจำนวนครั้งของลิงก์และไม่กินโควตารายวัน */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    await rateLimit(`keylink-check:${user.id}`, 30, 60);

    const config = await loadKeyLinkConfig();
    if (!config.enabled) throw new ApiError(403, "ตัวช่วยลิงก์คีย์ถูกปิดโดยแอดมิน");

    const body = await readJson<{ url?: string }>(req);
    const preview = await inspectLink(optionalStr(body.url, 500), new URL(req.url).hostname);

    if (!preview.ok) throw new ApiError(400, LINK_REASON_TEXT[preview.reason]);

    return json({
      link: {
        url: preview.url,
        host: preview.host,
        kind: preview.kind,
        shareStatus: preview.shareStatus,
        shareStatusText: preview.shareStatus ? SHARE_STATUS_TEXT[preview.shareStatus] ?? null : null,
        share: preview.share
          ? {
              label: preview.share.label,
              uses: preview.share.uses,
              max_uses: preview.share.max_uses,
              expires_at: preview.share.expires_at,
              creator_nickname: preview.share.creator_nickname,
            }
          : null,
        note:
          preview.kind === "share"
            ? "ลิงก์แชร์คีย์ของห้องนี้ — ปลดล็อกแล้วจะได้คีย์จริง 1 ใบ"
            : "ลิงก์ภายนอกโดเมนที่อนุญาต — ตรวจสอบได้ แต่ระบบจะไม่ออกรหัสคีย์",
      },
    });
  } catch (error) {
    return fail(error);
  }
}
