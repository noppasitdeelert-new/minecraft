"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/client";
import { formatDateTime, relativeTime } from "@/lib/format";
import { Alert, Avatar, Empty, SectionCard } from "./ui";
import { Icon } from "./icons";

type KeyRequest = {
  id: number;
  user_id: number;
  purpose: string | null;
  status: "pending" | "approved" | "denied";
  code: string | null;
  created_at: string;
  handled_at: string | null;
  nickname: string;
  avatar_color: string;
  handler_nickname: string | null;
};

type ExchangeRow = {
  id: number;
  token: string;
  label: string | null;
  max_uses: number;
  uses: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  last_viewed_at: string | null;
  creator_nickname: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  approved: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  denied: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  denied: "ไม่อนุมัติ",
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback ด้านล่าง */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
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

export default function KeysClient({ canManage }: { canManage: boolean }) {
  const [mine, setMine] = useState<KeyRequest[]>([]);
  const [queue, setQueue] = useState<KeyRequest[]>([]);
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [shares, setShares] = useState<ExchangeRow[]>([]);
  const [unusedCount, setUnusedCount] = useState<number | null>(null);
  const [shareForm, setShareForm] = useState({ label: "", days: "7", maxUses: "10" });
  const [lastLink, setLastLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<{ mine: KeyRequest[]; queue: KeyRequest[] }>("/api/key-requests");
      setMine(res.mine);
      setQueue(res.queue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลคีย์ไม่สำเร็จ");
    }
  }, []);

  const loadShares = useCallback(async () => {
    if (!canManage) return;
    try {
      const res = await apiGet<{ shares: ExchangeRow[]; unusedCount: number }>("/api/admin/key-shares");
      setShares(res.shares);
      setUnusedCount(res.unusedCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดลิงก์แชร์ไม่สำเร็จ");
    }
  }, [canManage]);

  useEffect(() => {
    void load();
    void loadShares();
  }, [load, loadShares]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  async function requestKey(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiPost("/api/key-requests", { purpose });
      setPurpose("");
      setNotice("ส่งคำขอแล้ว — รอผู้ดูแลอนุมัติ แล้วคีย์จะแสดงที่นี่");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleRequest(id: number, action: "approve" | "deny") {
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/api/key-requests/${id}`, { action });
      await load();
      await loadShares();
      setNotice(action === "approve" ? "อนุมัติแล้ว — คีย์ถูกส่งให้ผู้ขอในหน้าเดียวกัน" : "ปฏิเสธคำขอแล้ว");
    } catch (err) {
      setError(err instanceof Error ? err.message : "จัดการคำขอไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function createShare(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ url: string }>("/api/admin/key-shares", {
        label: shareForm.label,
        days: Number(shareForm.days),
        maxUses: Number(shareForm.maxUses),
      });
      setLastLink(res.url);
      await copyText(res.url);
      setNotice("สร้างลิงก์แล้ว และคัดลอกลงคลิปบอร์ดให้เรียบร้อย");
      await loadShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างลิงก์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function revokeShare(id: number) {
    if (!confirm("ยกเลิกลิงก์นี้? ใครที่ยังไม่เปิดจะเปิดไม่ได้อีก")) return;
    try {
      await apiDelete(`/api/admin/key-shares/${id}`);
      await loadShares();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ยกเลิกลิงก์ไม่สำเร็จ");
    }
  }

  return (
    <div className="space-y-5">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="ขอคีย์เข้าห้อง" icon="key">
          <p className="mb-3 text-xs text-slate-400">
            ต้องการคีย์ให้เพื่อนเข้าห้อง? ส่งคำขอพร้อมเหตุผล ผู้ดูแลจะอนุมัติและออกคีย์ให้ทันที
          </p>
          <form onSubmit={requestKey} className="space-y-2.5">
            <textarea
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              maxLength={300}
              rows={2}
              placeholder="เช่น ขอคีย์ให้ น้องเอส (เพื่อนย้ายเข้าห้องใหม่)"
              className="input resize-y text-sm"
            />
            <button className="btn btn-primary w-full" disabled={busy}>
              <Icon name="send" className="size-4" /> ส่งคำขอคีย์
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {mine.length === 0 ? (
              <p className="text-xs text-slate-500">ยังไม่มีคำขอของคุณ</p>
            ) : (
              mine.map((row) => (
                <div key={row.id} className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <div className="flex items-center gap-2">
                    <span className={`badge ${STATUS_STYLE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                    <span className="text-[11px] text-slate-500">{relativeTime(row.created_at)}</span>
                    {row.handler_nickname ? (
                      <span className="ml-auto text-[11px] text-slate-500">โดย {row.handler_nickname}</span>
                    ) : null}
                  </div>
                  {row.purpose ? <p className="mt-1 text-xs text-slate-300">{row.purpose}</p> : null}
                  {row.code ? (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-950/60 px-2.5 py-1.5">
                      <code className="flex-1 font-mono text-sm tracking-wide text-emerald-200">{row.code}</code>
                      <button
                        onClick={async () => {
                          if (await copyText(row.code!)) setCopied(`mine-${row.id}`);
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                        title="คัดลอกคีย์"
                      >
                        <Icon name={copied === `mine-${row.id}` ? "check" : "copy"} className="size-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </SectionCard>

        {canManage ? (
          <SectionCard title="ลิงก์แชร์คีย์ (มีโทเคน + หมดอายุ)" icon="link">
            <p className="mb-3 text-xs text-slate-400">
              ลิงก์สุ่มเดาไม่ได้ จำกัดจำนวนครั้งที่เปิด และกำหนดวันหมดอายุ — เหมาะกับการส่งให้เพื่อนนอกแชต
              {unusedCount !== null ? ` · ตอนนี้มีคีย์ว่าง ${unusedCount} ใบ` : ""}
            </p>

            <form onSubmit={createShare} className="space-y-2.5">
              <input
                value={shareForm.label}
                onChange={(event) => setShareForm({ ...shareForm, label: event.target.value })}
                maxLength={80}
                placeholder="ชื่อลิงก์ (เช่น สำหรับเพื่อน ม.4/2)"
                className="input text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-400">
                  อายุ (วัน)
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={shareForm.days}
                    onChange={(event) => setShareForm({ ...shareForm, days: event.target.value })}
                    className="input mt-1 text-sm"
                  />
                </label>
                <label className="text-[11px] text-slate-400">
                  เปิดได้ (ครั้ง)
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={shareForm.maxUses}
                    onChange={(event) => setShareForm({ ...shareForm, maxUses: event.target.value })}
                    className="input mt-1 text-sm"
                  />
                </label>
              </div>
              <button className="btn btn-primary w-full" disabled={busy}>
                <Icon name="link" className="size-4" /> สร้างลิงก์แชร์คีย์
              </button>
            </form>

            {lastLink ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-2">
                <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-emerald-100">{lastLink}</code>
                <button
                  onClick={async () => {
                    if (await copyText(lastLink)) setCopied("last-link");
                  }}
                  className="shrink-0 rounded p-1 text-emerald-200 hover:bg-white/10"
                  title="คัดลอกลิงก์"
                >
                  <Icon name={copied === "last-link" ? "check" : "copy"} className="size-4" />
                </button>
              </div>
            ) : null}

            <ul className="mt-4 space-y-2">
              {shares.length === 0 ? (
                <li className="text-xs text-slate-500">ยังไม่มีลิงก์ที่สร้างไว้</li>
              ) : (
                shares.map((share) => {
                  const dead =
                    share.revoked_at !== null ||
                    new Date(share.expires_at).getTime() <= Date.now() ||
                    share.uses >= share.max_uses;
                  return (
                    <li key={share.id} className="rounded-xl border border-white/8 bg-white/[0.025] p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`badge ${dead ? "bg-slate-500/15 text-slate-400 ring-slate-400/30" : "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"}`}>
                          {dead ? "ใช้ไม่ได้แล้ว" : "ใช้งานได้"}
                        </span>
                        <span className="truncate text-xs text-slate-200">{share.label ?? "ไม่มีชื่อ"}</span>
                        <span className="ml-auto text-[10px] text-slate-500">
                          เปิด {share.uses}/{share.max_uses} · ถึง {formatDateTime(share.expires_at)}
                        </span>
                      </div>
                      {!dead ? (
                        <div className="mt-1.5 flex items-center gap-2">
                          <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-500">
                            /s/{share.token.slice(0, 10)}…
                          </code>
                          <button
                            onClick={async () => {
                              if (await copyText(`${window.location.origin}/s/${share.token}`)) setCopied(`share-${share.id}`);
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                            title="คัดลอกลิงก์"
                          >
                            <Icon name={copied === `share-${share.id}` ? "check" : "copy"} className="size-3.5" />
                          </button>
                          <button
                            onClick={() => void revokeShare(share.id)}
                            className="rounded p-1 text-slate-500 hover:bg-white/10 hover:text-rose-300"
                            title="ยกเลิกลิงก์"
                          >
                            <Icon name="trash" className="size-3.5" />
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })
              )}
            </ul>
          </SectionCard>
        ) : (
          <SectionCard title="คีย์คืออะไร" icon="help">
            <ul className="space-y-2 text-xs text-slate-400">
              <li>• คีย์ 1 ใบใช้สมัครได้ 1 ครั้ง แล้วหมดอายุทันที</li>
              <li>• ระบบจะเติมคีย์ชุดใหม่ให้อัตโนมัติทุก ๆ 5 คนที่ใช้คีย์สมัคร</li>
              <li>• ถ้าคีย์หมด ขอกับผู้ดูแลผ่านฟอร์มด้านซ้ายได้เลย</li>
              <li>• ห้ามโพสต์คีย์หรือลิงก์แชร์ลงที่สาธารณะ</li>
            </ul>
          </SectionCard>
        )}
      </div>

      {canManage ? (
        <SectionCard title="คิวคำขอคีย์จากสมาชิก" icon="users">
          {queue.length === 0 ? (
            <Empty icon="key" title="ไม่มีคำขอค้างอยู่" hint="เมื่อมีสมาชิกส่งคำขอ จะมาแสดงที่นี่" />
          ) : (
            <ul className="space-y-2">
              {queue.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <Avatar name={row.nickname} color={row.avatar_color} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-100">{row.nickname}</p>
                    <p className="text-[11px] text-slate-500">
                      {row.purpose || "ไม่ได้ระบุเหตุผล"} · {relativeTime(row.created_at)}
                    </p>
                  </div>
                  <button onClick={() => void handleRequest(row.id, "approve")} disabled={busy} className="btn btn-primary btn-sm">
                    <Icon name="check" className="size-3.5" /> อนุมัติ
                  </button>
                  <button onClick={() => void handleRequest(row.id, "deny")} disabled={busy} className="btn btn-danger btn-sm">
                    ปฏิเสธ
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
