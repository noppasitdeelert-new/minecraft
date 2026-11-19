"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/client";
import { formatTime, relativeTime } from "@/lib/format";
import type { Channel, ChatMessage } from "@/lib/types";
import { Avatar, Empty } from "./ui";
import { RoleBadge } from "./ui";
import { Icon } from "./icons";

type Props = {
  channels: Channel[];
  me: { id: number; nickname: string; role: string; avatar_color: string };
};

export default function ChatClient({ channels, me }: Props) {
  const [activeId, setActiveId] = useState<number>(channels[0]?.id ?? 0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  const lastIdRef = useRef(0);
  const stickToBottom = useRef(true);

  const active = useMemo(() => channels.find((c) => c.id === activeId), [channels, activeId]);
  const canModerate = me.role === "owner" || me.role === "admin" || me.role === "moderator";

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const loadAll = useCallback(async () => {
    if (!activeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ messages: ChatMessage[] }>(`/api/chat/channels/${activeId}/messages`);
      setMessages(res.messages);
      lastIdRef.current = res.messages.at(-1)?.id ?? 0;
      requestAnimationFrame(() => scrollToBottom());
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อความไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [activeId, scrollToBottom]);

  useEffect(() => {
    stickToBottom.current = true;
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await apiGet<{ messages: ChatMessage[] }>(`/api/chat/channels/${activeId}/messages?after=${lastIdRef.current}`);
        if (cancelled || res.messages.length === 0) return;
        setMessages((prev) => [...prev, ...res.messages.filter((m) => !prev.some((p) => p.id === m.id))]);
        lastIdRef.current = res.messages.at(-1)!.id;
        if (stickToBottom.current) requestAnimationFrame(() => scrollToBottom(true));
      } catch {
        /* silent polling failure */
      }
    };

    const timer = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeId, scrollToBottom]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiPost<{ message: ChatMessage }>(`/api/chat/channels/${activeId}/messages`, { body: text });
      setMessages((prev) => [...prev, res.message]);
      lastIdRef.current = res.message.id;
      setDraft("");
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("ลบข้อความนี้?")) return;
    try {
      await apiDelete(`/api/chat/channels/${activeId}/messages?messageId=${id}`);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <div className="card grid overflow-hidden md:grid-cols-[15rem_1fr]" style={{ height: "calc(100dvh - 13rem)", minHeight: 480 }}>
      {/* Channel list */}
      <aside className="hidden flex-col border-r border-white/8 md:flex">
        <div className="border-b border-white/8 px-4 py-3">
          <p className="text-xs font-semibold tracking-wide text-slate-400">ช่องแชตของห้อง</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                c.id === activeId ? "bg-indigo-500/15 text-white ring-1 ring-inset ring-indigo-400/25" : "text-slate-400 hover:bg-white/5"
              }`}
            >
              <span className="text-base">{c.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.name}</span>
                {c.description ? <span className="block truncate text-[11px] text-slate-500">{c.description}</span> : null}
              </span>
              {c.message_count ? (
                <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">{c.message_count}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/8 p-3 text-[11px] text-slate-500">
          <p className="font-medium text-slate-400">{me.nickname}</p>
          <p>ส่งข้อความในนามชื่อเล่นของคุณ</p>
        </div>
      </aside>

      {/* Messages */}
      <section className="flex min-h-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <span>{active?.icon ?? "#"}</span>
              <span className="truncate">{active?.name ?? "เลือกห้องแชต"}</span>
            </h2>
            <p className="truncate text-[11px] text-slate-500">{active?.description ?? "พูดคุยกับเพื่อนในห้อง"}</p>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300 sm:flex">
            <span className="size-1.5 rounded-full bg-emerald-400" /> อัปเดตอัตโนมัติ
          </span>
        </header>

        {/* Mobile channel chips */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-white/8 px-3 py-2 md:hidden">
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition ${
                c.id === activeId ? "bg-indigo-500/20 text-white ring-1 ring-inset ring-indigo-400/30" : "bg-white/5 text-slate-400"
              }`}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>

        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          }}
          className="chat-scroll flex-1 space-y-1 px-3 py-4 sm:px-4"
        >
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <Empty icon="chat" title="ยังไม่มีข้อความในช่องนี้" hint="เริ่มบทสนทนาแรกของห้องได้เลย" />
          ) : (
            messages.map((m, index) => {
              const mine = m.user.id === me.id;
              const prev = messages[index - 1];
              const grouped = prev && prev.user.id === m.user.id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 240000;
              return (
                <div key={m.id} className={`group flex gap-2.5 ${grouped ? "mt-0.5" : "mt-3"}`}>
                  <div className="w-8 shrink-0">
                    {!grouped ? <Avatar name={m.user.nickname} color={m.user.avatar_color} size={32} /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    {!grouped ? (
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-100">{m.user.nickname}</span>
                        <RoleBadge role={m.user.role} className="!text-[9px] !px-1.5 !py-0" />
                        <span className="text-[10px] text-slate-500" title={relativeTime(m.created_at)}>
                          {formatTime(m.created_at)}
                        </span>
                        {mine || canModerate ? (
                          <button
                            onClick={() => remove(m.id)}
                            className="ml-auto rounded p-0.5 text-slate-600 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                            title="ลบข้อความ"
                          >
                            <Icon name="trash" className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    <p
                      className={`inline-block max-w-full rounded-2xl px-3 py-1.5 text-sm break-words whitespace-pre-wrap ${
                        mine ? "bg-indigo-500/20 text-indigo-50" : "bg-white/[0.05] text-slate-200"
                      }`}
                    >
                      {m.body}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {error ? <p className="border-t border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">{error}</p> : null}

        <form onSubmit={send} className="flex items-end gap-2 border-t border-white/8 px-3 py-3 sm:px-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(e);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder={`ส่งข้อความถึง ${active?.name ?? "ห้องแชต"}...`}
            className="input max-h-32 min-h-[42px] flex-1 resize-none py-2.5"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="btn btn-primary size-[42px] shrink-0 !px-0"
            aria-label="ส่งข้อความ"
          >
            <Icon name="send" className="size-4" />
          </button>
        </form>
      </section>
    </div>
  );
}
