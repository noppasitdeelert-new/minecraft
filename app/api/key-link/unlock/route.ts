import { ApiError, fail, json, optionalStr, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { unlockLink } from "@/lib/keylink";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    await rateLimit(`keylink-unlock:${user.id}`, 6, 60);

    const body = await readJson<{ url?: string }>(req);
    const result = await unlockLink({
      user: { id: user.id, nickname: user.nickname },
      url: optionalStr(body.url, 500) ?? "",
      siteHost: new URL(req.url).hostname,
    });

    return json({
      status: result.status,
      key: result.key,
      message: result.message,
      remaining: result.remaining,
      job: {
        id: result.job.id,
        host: result.job.host,
        kind: result.job.kind,
        status: result.job.status,
        created_at: result.job.created_at,
      },
      share: result.share
        ? { label: result.share.label, max_uses: result.share.max_uses, uses: result.share.uses }
        : null,
    });
  } catch (error) {
    if (error instanceof ApiError) return fail(error);
    return fail(error);
  }
}
