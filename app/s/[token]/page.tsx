import Link from "next/link";
import { headers } from "next/headers";
import { inspectKeyShare, consumeKeyShare } from "@/lib/keyshare";
import { unusedInviteCodes } from "@/lib/keys";
import { rateLimit } from "@/lib/ratelimit";
import { formatDateTime } from "@/lib/format";
import ShareKeys from "@/components/ShareKeys";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";
export const metadata = { title: "คีย์ห้อง SKC105", robots: { index: false, follow: false } };

const REASONS: Record<string, { title: string; detail: string }> = {
  missing: { title: "ไม่พบลิงก์นี้", detail: "ลิงก์อาจถูกพิมพ์ผิด หรือแอดมินลบลิงก์ไปแล้ว" },
  revoked: { title: "ลิงก์ถูกยกเลิก", detail: "แอดมินยกเลิกลิงก์นี้แล้ว — ขอลิงก์ใหม่จากแอดมินได้เลย" },
  expired: { title: "ลิงก์หมดอายุ", detail: "ลิงก์มีอายุจำกัดเพื่อความปลอดภัย — ขอใหม่จากแอดมินได้" },
  "used-up": { title: "ลิงก์ถูกเปิดครบจำนวนแล้ว", detail: "ลิงก์นี้เปิดได้ตามจำนวนครั้งที่กำหนดเท่านั้น" },
};

export default async function KeySharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const headerList = await headers();
  const ip =
    headerList.get("cf-connecting-ip") || headerList.get("x-real-ip") || headerList.get("x-forwarded-for")?.split(",")[0] || "unknown";
  let limited = false;
  try {
    await rateLimit(`share-view:${ip.trim()}`, 30, 60);
  } catch {
    limited = true;
  }

  if (limited) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5">
        <div className="card w-full p-7 text-center">
          <h1 className="text-lg font-semibold text-white">เปิดลิงก์ถี่เกินไป</h1>
          <p className="mt-2 text-sm text-slate-400">กรุณารอสักครู่แล้วลองเปิดลิงก์อีกครั้ง</p>
        </div>
      </main>
    );
  }

  const state = await inspectKeyShare(token);

  if (state.status !== "ok") {
    const reason = REASONS[state.status] ?? REASONS.missing;
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-5">
        <div className="card w-full p-7 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300">
            <Icon name="key" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-white">{reason.title}</h1>
          <p className="mt-1.5 text-sm text-slate-400">{reason.detail}</p>
          <Link href="/register" className="btn btn-primary mt-5">
            <Icon name="user" className="size-4" /> สมัครด้วยคีย์
          </Link>
        </div>
      </main>
    );
  }

  const share = state.share;
  await consumeKeyShare(share.id);
  const codes = await unusedInviteCodes();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-5 py-10">
      <div className="card p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-black text-white">
            SK
          </span>
          <div>
            <h1 className="text-lg font-bold text-white">คีย์เข้าห้อง SKC105</h1>
            <p className="text-xs text-slate-400">
              {share.label ? `${share.label} · ` : ""}เปิดได้อีก {Math.max(0, share.max_uses - share.uses)} ครั้ง ·
              หมดอายุ {formatDateTime(share.expires_at)}
            </p>
          </div>
        </div>

        <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
          คีย์แต่ละใบใช้สมัครได้ 1 ครั้งเท่านั้น — อย่าแชร์ลิงก์นี้ต่อนอกห้อง และอย่าโพสต์ลงที่สาธารณะ
        </p>

        <div className="mt-4">
          <ShareKeys codes={codes} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/register" className="btn btn-primary">
            <Icon name="user" className="size-4" /> สมัครสมาชิกด้วยคีย์
          </Link>
          <Link href="/login" className="btn btn-ghost">
            เข้าสู่ระบบ
          </Link>
        </div>

        <p className="mt-4 text-[11px] text-slate-500">
          จำนวนครั้งที่เปิดลิงก์ถูกบันทึกไว้ · ลิงก์นี้สร้างโดย {share.creator_nickname ?? "แอดมิน"}
        </p>
      </div>
    </main>
  );
}
