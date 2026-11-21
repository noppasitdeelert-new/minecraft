"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiDelete, apiGet, apiPost } from "@/lib/client";
import { formatDateTime, relativeTime } from "@/lib/format";
import { Alert, Empty, SectionCard } from "./ui";
import { Icon } from "./icons";

const STEP_LABELS = [
  "ตรวจสอบรูปแบบลิงก์",
  "ตรวจโดเมนที่อนุญาต",
  "ยืนยันลิงก์กับเซิร์ฟเวอร์",
  "ดึงคีย์จากคลังห้อง",
  "บันทึกประวัติการใช้งาน",
];

type Config = {
  enabled: boolean;
  dailyLimit: number;
  extraDomains: string[];
  usedToday: number;
  remaining: number;
};

type Pool = { available: number; unassigned: number };

type HistoryRow = {
  id: number;
  url: string;
  host: string;
  kind: "share" | "external";
  status: "unlocked" | "validated" | "failed";
  key_code: string | null;
  detail: string | null;
  created_at: string;
  completed_at: string | null;
};

type Preview = {
  url: string;
  host: string;
  kind: "share" | "external";
  note: string;
  shareStatusText: string | null;
  share: {
    label: string | null;
    uses: number;
    max_uses: number;
    expires_at: string;
    creator_nickname: string | null;
  } | null;
};

type UnlockResponse = {
  status: "unlocked" | "validated";
  key: string | null;
  message: string;
  remaining: number;
  job: { id: number; host: string; kind: string; status: string; created_at: string };
};

type StepState = "pending" | "active" | "done" | "error";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* ใช้วิธีสำรองด้านล่าง */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  unlocked: { className: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30", label: "ปลดล็อกแล้ว" },
  validated: { className: "bg-sky-500/15 text-sky-300 ring-sky-400/30", label: "ตรวจสอบแล้ว" },
  failed: { className: "bg-rose-500/15 text-rose-300 ring-rose-400/30", label: "ไม่สำเร็จ" },
};

export default function KeyLinkClient({ nickname, canManage }: { nickname: string; canManage: boolean }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [pool, setPool] = useState<Pool | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [steps, setSteps] = useState<Array<{ label: string; state: StepState }>>([]);
  const [result, setResult] = useState<UnlockResponse | null>(null);

  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ config: Config; pool: Pool; history: HistoryRow[] }>("/api/key-link");
      setConfig(res.config);
      setPool(res.pool);
      setHistory(res.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลตัวช่วยลิงก์คีย์ไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  function mark(index: number, state: StepState) {
    setSteps((prev) => prev.map((step, i) => (i === index ? { ...step, state } : step)));
  }

  function reset() {
    setUrl("");
    setPreview(null);
    setSteps([]);
    setResult(null);
    setError(null);
    setNotice(null);
  }

  async function checkLink(event?: React.FormEvent) {
    event?.preventDefault();
    if (checking || busy) return;
    if (!url.trim()) {
      setError("กรุณาวางลิงก์ก่อนตรวจสอบ");
      return;
    }
    setChecking(true);
    setError(null);
    setNotice(null);
    setPreview(null);
    setResult(null);
    setSteps([]);
    try {
      const res = await apiPost<{ link: Preview }>("/api/key-link/validate", { url: url.trim() });
      setPreview(res.link);
      setNotice("ลิงก์รูปแบบถูกต้อง พร้อมปลดล็อก");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตรวจสอบลิงก์ไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  }

  async function unlock() {
    if (busy || !url.trim()) {
      if (!url.trim()) setError("กรุณาวางลิงก์ก่อนปลดล็อก");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setResult(null);
    setSteps(STEP_LABELS.map((label) => ({ label, state: "pending" as StepState })));

    let current = 0;
    try {
      mark(current, "active");
      await sleep(280);
      mark(current, "done");

      current = 1;
      mark(current, "active");
      await sleep(320);
      mark(current, "done");

      current = 2;
      mark(current, "active");
      const res = await apiPost<UnlockResponse>("/api/key-link/unlock", { url: url.trim() });
      mark(current, "done");

      current = 3;
      mark(current, "active");
      await sleep(300);
      mark(current, "done");

      current = 4;
      mark(current, "active");
      await sleep(240);
      mark(current, "done");

      setResult(res);
      setNotice(res.message);
      if (res.key) {
        const ok = await copyText(res.key);
        if (ok) setCopied("result");
      }
      await load();
    } catch (err) {
      mark(current, "error");
      setError(err instanceof Error ? err.message : "ปลดล็อกลิงก์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function removeHistory(id: number) {
    if (!confirm("ลบรายการนี้ออกจากประวัติของคุณ?")) return;
    try {
      await apiDelete(`/api/key-link/${id}`);
      await load();
      setNotice("ลบรายการประวัติแล้ว (คีย์ที่เคยได้ยังใช้งานได้ตามปกติ)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบรายการไม่สำเร็จ");
    }
  }

  const disabled = config !== null && !config.enabled;

  return (
    <div className="space-y-5">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {disabled ? <Alert tone="info">แอดมินปิดตัวช่วยลิงก์คีย์ไว้ชั่วคราว — ติดต่อผู้ดูแลห้องหากต้องการใช้งาน</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <SectionCard title="วางลิงก์รับคีย์" icon="link">
          <form onSubmit={checkLink} className="space-y-2.5">
            <label className="block">
              <span className="label">ลิงก์รับคีย์ (https://…)</span>
              <input
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setPreview(null);
                  setResult(null);
                  setSteps([]);
                }}
                maxLength={500}
                disabled={disabled || busy}
                placeholder="https://skc105-room.freebuff.site/s/…"
                className="input font-mono text-xs"
                spellCheck={false}
                autoComplete="off"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn btn-ghost btn-sm" disabled={disabled || busy || checking}>
                <Icon name="search" className="size-4" /> {checking ? "กำลังตรวจสอบ…" : "ตรวจสอบลิงก์"}
              </button>
              <button
                type="button"
                onClick={() => void unlock()}
                className="btn btn-primary btn-sm"
                disabled={disabled || busy || !url.trim()}
              >
                <Icon name="key" className="size-4" /> {busy ? "กำลังปลดล็อก…" : "เริ่มปลดล็อก"}
              </button>
              <button type="button" onClick={reset} className="btn btn-ghost btn-sm" disabled={busy}>
                ล้างค่า / เริ่มใหม่
              </button>
            </div>

            <p className="text-[11px] text-slate-500">
              ใช้ได้เฉพาะลิงก์ <span className="font-mono">/s/&lt;โทเคน&gt;</span> ของห้องนี้ และโดเมนที่แอดมินอนุญาต ·
              ระบบไม่เก็บรหัสผ่านหรือข้อมูลบัญชีของลิงก์ภายนอก
            </p>
          </form>

          {config ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-[11px] text-slate-400">
              <span className="badge bg-indigo-500/15 text-indigo-200 ring-indigo-400/25">
                {config.usedToday}/{config.dailyLimit} ครั้งวันนี้
              </span>
              <span>เหลืออีก {config.remaining} ครั้ง</span>
              {pool ? (
                <span className="ml-auto">
                  คีย์ว่างในคลัง {pool.available} ใบ · ยังไม่ถูกจ่ายผ่านตัวช่วย {pool.unassigned} ใบ
                </span>
              ) : null}
            </div>
          ) : null}

          {preview ? (
            <div className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.07] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge bg-emerald-500/15 text-emerald-300 ring-emerald-400/30">
                  {preview.kind === "share" ? "ลิงก์แชร์คีย์" : "ลิงก์ภายนอก"}
                </span>
                <span className="font-mono text-[11px] text-slate-300">{preview.host}</span>
                {preview.shareStatusText ? (
                  <span className="text-[11px] text-emerald-200">{preview.shareStatusText}</span>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs text-slate-300">{preview.note}</p>
              {preview.share ? (
                <p className="mt-1 text-[11px] text-slate-400">
                  {preview.share.label ? `${preview.share.label} · ` : ""}เปิดแล้ว {preview.share.uses}/
                  {preview.share.max_uses} ครั้ง · หมดอายุ {formatDateTime(preview.share.expires_at)} · สร้างโดย{" "}
                  {preview.share.creator_nickname ?? "แอดมิน"}
                </p>
              ) : null}
            </div>
          ) : null}

          {steps.length > 0 ? (
            <ol className="mt-4 space-y-2">
              {steps.map((step, index) => (
                <li key={step.label} className="flex items-center gap-2.5 text-xs">
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ring-1 ring-inset ${
                      step.state === "done"
                        ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
                        : step.state === "active"
                          ? "animate-pulse bg-indigo-500/20 text-indigo-200 ring-indigo-400/40"
                          : step.state === "error"
                            ? "bg-rose-500/15 text-rose-300 ring-rose-400/30"
                            : "bg-white/5 text-slate-500 ring-white/10"
                    }`}
                  >
                    {step.state === "done" ? (
                      <Icon name="check" className="size-3.5" />
                    ) : step.state === "error" ? (
                      <Icon name="close" className="size-3.5" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={
                      step.state === "pending"
                        ? "text-slate-500"
                        : step.state === "active"
                          ? "text-indigo-200"
                          : step.state === "error"
                            ? "text-rose-300"
                            : "text-slate-300"
                    }
                  >
                    {step.label}
                    {step.state === "active" ? "…" : ""}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </SectionCard>

        <SectionCard title="ผลลัพธ์คีย์" icon="key">
          {result ? (
            <div className="space-y-3">
              {result.key ? (
                <div className="rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/[0.12] to-indigo-500/[0.06] p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-300">คีย์ของคุณ</p>
                  <p className="mt-1.5 break-all rounded-xl bg-slate-950/70 px-3 py-3 font-mono text-2xl font-bold tracking-wider text-emerald-200">
                    {result.key}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (result.key && (await copyText(result.key))) setCopied("result");
                      }}
                      className="btn btn-primary btn-sm"
                    >
                      <Icon name={copied === "result" ? "check" : "copy"} className="size-4" />
                      {copied === "result" ? "คัดลอกแล้ว" : "คัดลอกคีย์"}
                    </button>
                    <a href="/register" className="btn btn-ghost btn-sm">
                      <Icon name="user" className="size-4" /> ไปสมัครด้วยคีย์
                    </a>
                  </div>
                  {copied === "result" ? (
                    <p className="mt-2 text-[11px] text-emerald-300">คัดลอกลง Clipboard แล้ว ✓</p>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-400">กดปุ่มแล้วคีย์จะอยู่ใน Clipboard ทันที</p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-sky-400/25 bg-sky-500/[0.08] p-4 text-sm text-sky-100">
                  {result.message}
                </div>
              )}

              <p className="text-xs text-slate-400">{result.message}</p>
              <p className="text-[11px] text-slate-500">
                เหลือโควตาวันนี้ {result.remaining} ครั้ง · บันทึกประวัติแล้ว (ดูในคลังด้านล่าง)
              </p>
              <button type="button" onClick={reset} className="btn btn-ghost btn-sm">
                <Icon name="plus" className="size-4" /> เริ่มลิงก์ใหม่
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/12 px-4 py-10 text-center">
              <span className="rounded-full bg-white/5 p-3 text-slate-400">
                <Icon name="key" />
              </span>
              <p className="text-sm font-medium text-slate-300">ยังไม่มีคีย์</p>
              <p className="max-w-xs text-xs text-slate-500">
                วางลิงก์ด้านซ้าย กด “ตรวจสอบลิงก์” แล้วกด “เริ่มปลดล็อก” — คีย์จะมาแสดงที่นี่พร้อมปุ่มคัดลอก
              </p>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title={`คลังคีย์ที่เคยปลดล็อก (${history.length})`}
        icon="box"
        action={
          canManage ? (
            <Link href="/admin" className="btn btn-ghost btn-sm">
              <Icon name="shield" className="size-4" /> ตั้งค่าที่ /admin
            </Link>
          ) : undefined
        }
      >
        <p className="mb-3 text-[11px] text-slate-500">
          ประวัติของบัญชี {nickname} — กดคัดลอกซ้ำได้ทุกเมื่อ และลบเฉพาะรายการของตัวเองได้
        </p>
        {history.length === 0 ? (
          <Empty icon="key" title="ยังไม่มีประวัติ" hint="เมื่อคุณปลดล็อกคีย์ครั้งแรก รายการจะมาแสดงที่นี่" />
        ) : (
          <ul className="space-y-2">
            {history.map((row) => {
              const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.failed;
              return (
                <li key={row.id} className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${badge.className}`}>{badge.label}</span>
                    <span className="font-mono text-[11px] text-slate-400">{row.host}</span>
                    <span className="text-[11px] text-slate-500">{relativeTime(row.created_at)}</span>
                    <button
                      type="button"
                      onClick={() => void removeHistory(row.id)}
                      className="ml-auto rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-rose-300"
                      title="ลบรายการนี้"
                    >
                      <Icon name="trash" className="size-3.5" />
                    </button>
                  </div>

                  {row.key_code ? (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-950/60 px-2.5 py-1.5">
                      <code className="min-w-0 flex-1 break-all font-mono text-sm tracking-wide text-emerald-200">
                        {row.key_code}
                      </code>
                      <button
                        type="button"
                        onClick={async () => {
                          if (row.key_code && (await copyText(row.key_code))) setCopied(`row-${row.id}`);
                        }}
                        className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
                        title="คัดลอกคีย์อีกครั้ง"
                      >
                        <Icon name={copied === `row-${row.id}` ? "check" : "copy"} className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[11px] text-slate-500">{row.detail ?? "ตรวจสอบลิงก์ภายนอกเท่านั้น"}</p>
                  )}

                  <p className="mt-1 truncate font-mono text-[10px] text-slate-600">{row.url}</p>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
