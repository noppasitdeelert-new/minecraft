"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/client";
import { formatTime } from "@/lib/format";
import { Icon } from "./icons";
import { Alert, Avatar } from "./ui";

type NoxChatMessage = { id: number; role: "user" | "assistant"; body: string; created_at: string };

/** ถ้าคำตอบของ Nox มีสัญลักษณ์ Markdown (** หรือ `) ให้มีปุ่มคัดลอกทั้งข้อความ */
const HAS_MARKDOWN = /\*\*|`/;

const SUGGESTIONS = [
  "สวนชลคือที่ไหน น่าไปไหม",
  "ช่วยสรุปการบ้านของห้อง ม.105 ให้หน่อย",
  "เทคนิคอ่านหนังสือก่อนสอบ",
  "Nox เป็นใคร ใครพัฒนา",
];

export default function NoxClient({
  initialMessages,
  configured,
  nickname,
}: {
  initialMessages: NoxChatMessage[];
  configured: boolean;
  nickname: string;
}) {
  const [messages, setMessages] = useState<NoxChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const copyTimer = useRef<number | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
  }, []);

  async function copyMessage(id: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopiedId(id);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopiedId(null), 1600);
  }

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => scrollToBottom());
  }, [scrollToBottom]);

  useEffect(() => {
    if (!configured) return;
    void apiGet<{ remaining: number }>("/api/nox")
      .then((res) => setRemaining(res.remaining))
      .catch(() => undefined);
  }, [configured]);

  async function send(text: string) {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    setDraft("");

    const optimistic: NoxChatMessage = {
      id: -Date.now(),
      role: "user",
      body,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    requestAnimationFrame(() => scrollToBottom(true));

    try {
      const res = await apiPost<{
        userMessage: NoxChatMessage;
        reply: NoxChatMessage;
        remaining: number;
      }>("/api/nox", { message: body });
      setMessages((prev) => [...prev.filter((m) => m.id !== optimistic.id), res.userMessage, res.reply]);
      setRemaining(res.remaining);
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
      setError(err instanceof Error ? err.message : "ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  async function clearHistory() {
    if (!confirm("ล้างประวัติการคุยกับ Nox ทั้งหมด?")) return;
    try {
      await apiDelete("/api/nox");
      setMessages([]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ล้างประวัติไม่สำเร็จ");
    }
  }

  return (
    <div className="card grid overflow-hidden" style={{ height: "calc(100dvh - 13rem)", minHeight: 480 }}>
      <section className="flex min-h-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-sky-500 text-white shadow-lg shadow-indigo-900/40">
              <Icon name="spark" className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                Nox
                <span className="badge bg-indigo-500/15 text-indigo-200 ring-indigo-400/25 !px-1.5 !py-0 !text-[9px]">
                  AI
                </span>
              </h2>
              <p className="truncate text-[11px] text-slate-500">พัฒนาโดย team Noxvalis · ที่ปรึกษาห้อง ม.105</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {remaining !== null ? (
              <span className="hidden rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-slate-400 sm:block">
                เหลือ {remaining} ข้อความวันนี้
              </span>
            ) : null}
            <button
              type="button"
              onClick={clearHistory}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-rose-300"
              title="ล้างประวัติการคุย"
            >
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        </header>

        {!configured ? (
          <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            Nox ยังไม่พร้อมใช้งาน — แอดมินต้องตั้งค่า <span className="font-mono">GROQ_API_KEY</span> ใน Sites → Secrets
            (หรือไฟล์ <span className="font-mono">.dev.vars</span> เมื่อรันในเครื่อง) แล้วรีสตาร์ท/ดีพลอยอีกครั้ง
          </div>
        ) : null}

        <div ref={scroller} className="chat-scroll flex-1 space-y-3 px-3 py-4 sm:px-5">
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                  <Icon name="spark" className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">สวัสดี {nickname} 👋</p>
                  <p className="text-[11px] text-slate-500">ผมชื่อ Nox พัฒนาโดย team Noxvalis</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-300">
                ถามได้เรื่องสวนชล ห้อง ม.105 การเรียน การบ้าน ตารางเรียน และเรื่องทั่วไปที่ช่วยให้เรียนง่ายขึ้นนะ
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-indigo-400/30 hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m) => {
            const mine = m.role === "user";
            const showCopy = !mine && HAS_MARKDOWN.test(m.body);
            return (
              <div key={m.id} className={`flex gap-2.5 ${mine ? "justify-end" : ""}`}>
                {!mine ? (
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                    <Icon name="spark" className="size-4" />
                  </span>
                ) : null}
                <div className={`max-w-[85%] ${mine ? "text-right" : ""}`}>
                  <div
                    className={`inline-block rounded-2xl px-3.5 py-2 text-left text-sm break-words whitespace-pre-wrap ${
                      mine ? "bg-indigo-500/20 text-indigo-50" : "bg-white/[0.05] text-slate-200"
                    }`}
                  >
                    {m.body}
                  </div>
                  <div className={`mt-1 flex items-center gap-2 ${mine ? "justify-end" : ""}`}>
                    {showCopy ? (
                      <button
                        type="button"
                        onClick={() => void copyMessage(m.id, m.body)}
                        className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-400 transition hover:border-indigo-400/30 hover:text-white"
                        aria-label="คัดลอกคำตอบของ Nox ทั้งหมด"
                      >
                        <Icon name={copiedId === m.id ? "check" : "copy"} className="size-3" />
                        {copiedId === m.id ? "คัดลอกแล้ว" : "คัดลอก"}
                      </button>
                    ) : null}
                    <p className="text-[10px] text-slate-500">
                      {mine ? nickname : "Nox"} · {formatTime(m.created_at)}
                    </p>
                  </div>
                </div>
                {mine ? <Avatar name={nickname} size={32} className="mt-0.5" /> : null}
              </div>
            );
          })}

          {sending ? (
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                <Icon name="spark" className="size-4" />
              </span>
              <span className="rounded-2xl bg-white/[0.05] px-3.5 py-2 text-sm text-slate-400">Nox กำลังพิมพ์…</span>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="px-3 pb-2 sm:px-5">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
          className="flex items-end gap-2 border-t border-white/8 px-3 py-3 sm:px-4"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="ถาม Nox เกี่ยวกับสวนชล ห้อง ม.105 หรือการเรียน..."
            className="input max-h-32 min-h-[42px] flex-1 resize-none py-2.5"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim() || !configured}
            className="btn btn-primary size-[42px] shrink-0 !px-0"
            aria-label="ส่งข้อความถึง Nox"
          >
            <Icon name="send" className="size-4" />
          </button>
        </form>
      </section>
    </div>
  );
}
