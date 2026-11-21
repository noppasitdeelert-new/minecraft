import { fail, json, readJson, optionalStr } from "@/lib/api";
import { requireUser, canManage } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { createKeyShare, listKeyShares, shareLink, SHARE_MAX_DAYS } from "@/lib/keyshare";
import { unusedInviteCodes } from "@/lib/keys";
import { logAudit } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    if (!canManage(user.role)) throw new ApiError(403, "เฉพาะแอดมินเท่านั้น");

    const [shares, unused] = await Promise.all([listKeyShares(), unusedInviteCodes()]);
    return json({ shares, unusedCount: unused.length, maxDays: SHARE_MAX_DAYS });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManage(user.role)) throw new ApiError(403, "เฉพาะแอดมินเท่านั้น");

    const body = await readJson<{ label?: string; days?: number; maxUses?: number }>(req);
    const share = await createKeyShare({
      label: optionalStr(body.label, 80),
      days: Number(body.days ?? 7),
      maxUses: Number(body.maxUses ?? 10),
      createdBy: user.id,
    });

    const unused = await unusedInviteCodes();
    await logAudit(
      user.id,
      "keyshare.create",
      `keyshare:${share.id}`,
      `ลิงก์แชร์คีย์ ${share.max_uses} ครั้ง · ${share.expires_at}`,
    );

    return json({
      share,
      url: shareLink(new URL(req.url).origin, share.token),
      unusedCount: unused.length,
    });
  } catch (error) {
    return fail(error);
  }
}
