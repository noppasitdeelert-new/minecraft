"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/client";
import { useVisiblePoll } from "@/lib/use-visible-poll";
import { formatTime, relativeTime } from "@/lib/format";
import type { Channel, ChatMessage } from "@/lib/types";
import { Avatar, Empty } from "./ui";
import { RoleBadge } from "./ui";
import { Icon } from "./icons";

/** Poll fast while the room is busy, back off when nobody is writing. */
const CHAT_ACTIVE_MS = 8000;
const CHAT_IDLE_MS = 30000;
const EMOJIS = ["👍", "❤️", "😂", "🔥", "✅", "👀"];
const EDIT_WINDOW_MS = 60 * 60 * 1000;

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
  const [emojiFor, setEmojiFor] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
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

  // เปิดจากลิงก์ ?channel=<id> (เช่นผลค้นหาจาก Command Palette)
  useEffect(() => {
    const wanted = Number(new URLSearchParams(window.location.search).get("channel") || 0);
    if (wanted && channels.some((c) => c.id === wanted)) setActiveId(wanted);
  }, [channels]);

  useEffect(() => {
    stickToBottom.current = true;
    void loadAll();
  }, [loadAll]);

  const channelRef = useRef(activeId);
  const quietPolls = useRef(0);
  const [pollMs, setPollMs] = useState(CHAT_ACTIVE_MS);

  useEffect(() => {
    channelRef.current = activeId;
    quietPolls.current = 0;
    setPollMs(CHAT_ACTIVE_MS);
  }, [activeId]);

  const poll = useCallback(async () => {
    const channelId = activeId;
    if (!channelId) return;
    try {
      const res = await apiGet<{ messages: ChatMessage[] }>(`/api/chat/channels/${channelId}/messages?after=${lastIdRef.current}`);
      if (channelId !== channelRef.current) return;
      if (res.messages.length === 0) {
        quietPolls.current += 1;
        if (quietPolls.current >= 4) setPollMs(CHAT_IDLE_MS);
        return;
      }
      quietPolls.current = 0;
      setPollMs(CHAT_ACTIVE_MS);
      setMessages((prev) => [...prev, ...res.messages.filter((m) => !prev.some((p) => p.id === m.id))]);
      lastIdRef.current = res.messages.at(-1)!.id;
      if (stickToBottom.current) requestAnimationFrame(() => scrollToBottom(true));
    } catch {
      quietPolls.current += 1;
      if (quietPolls.current >= 6) setPollMs(CHAT_IDLE_MS);
    }
  }, [activeId, scrollToBottom]);

  useVisiblePoll(poll, pollMs, Boolean(activeId));

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
      quietPolls.current = 0;
      setPollMs(CHAT_ACTIVE_MS);
      setDraft("");
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  async function react(id: number, emoji: string) {
    setBusyId(id);
    try {
      const res = await apiPost<{ reactions: ChatMessage["reactions"] }>(`/api/chat/messages/${id}/reactions`, { emoji });
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, reactions: res.reactions } : m)));
      setEmojiFor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "กดรีแอ็กชันไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const text = editing.body.trim();
    if (!text) return;
    setBusyId(editing.id);
    try {
      const res = await apiPatch<{ body: string; edited_at: string }>(`/api/chat/messages/${editing.id}`, { body: text });
      setMessages((prev) =>
        prev.map((m) => (m.id === editing.id ? { ...m, body: res.body, edited_at: res.edited_at } : m)),
      );
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "แก้ไขข้อความไม่สำเร็จ");
    } finally {
      setBusyId(null);
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
          <span
            className="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300 sm:flex"
            title="อัปเดตทุก 8 วินาทีเมื่อมีบทสนทนา เว้นช่วงเมื่อห้องเงียบ และหยุดเมื่อสลับแท็บ"
          >
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
                        <span className="ml-auto flex items-center gap-0.5">
                          {mine && Date.now() - new Date(m.created_at).getTime() < EDIT_WINDOW_MS ? (
                            <button
                              onClick={() => setEditing({ id: m.id, body: m.body })}
                              className="rounded p-0.5 text-slate-600 opacity-0 transition group-hover:opacity-100 hover:text-indigo-300"
                              title="แก้ไขข้อความ"
                            >
                              <Icon name="edit" className="size-3.5" />
                            </button>
                          ) : null}
                          {mine || canModerate ? (
                            <button
                              onClick={() => remove(m.id)}
                              className="rounded p-0.5 text-slate-600 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                              title="ลบข้อความ"
                            >
                              <Icon name="trash" className="size-3.5" />
                            </button>
                          ) : null}
                        </span>
                      </div>
                    ) : null}
                    {editing?.id === m.id ? (
                      <div className="space-y-1.5">
                        <textarea
                          value={editing.body}
                          onChange={(e) => setEditing({ id: m.id, body: e.target.value })}
                          rows={2}
                          maxLength={2000}
                          className="input min-h-16 text-sm"
                          autoFocus
                        />
                        <div className="flex gap-1.5">
                          <button onClick={() => void saveEdit()} disabled={busyId === m.id} className="btn btn-primary btn-sm">
                            บันทึก
                          </button>
                          <button onClick={() => setEditing(null)} className="btn btn-ghost btn-sm">
                            ยกเลิก
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p
                          className={`inline-block max-w-full rounded-2xl px-3 py-1.5 text-sm break-words whitespace-pre-wrap ${
                            mine ? "bg-indigo-500/20 text-indigo-50" : "bg-white/[0.05] text-slate-200"
                          }`}
                        >
                          {m.body}
                          {m.edited_at ? (
                            <span className="ml-1.5 align-baseline text-[10px] text-slate-500">(แก้ไขแล้ว)</span>
                          ) : null}
                        </p>

                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {m.reactions.map((reaction) => (
                            <button
                              key={reaction.emoji}
                              onClick={() => void react(m.id, reaction.emoji)}
                              disabled={busyId === m.id}
                              className={`rounded-full px-2 py-0.5 text-[11px] transition ${
                                reaction.mine
                                  ? "bg-indigo-500/25 text-indigo-100 ring-1 ring-inset ring-indigo-400/40"
                                  : "bg-white/[0.06] text-slate-300 hover:bg-white/10"
                              }`}
                              title={reaction.mine ? "เอาอิโมจินี้ออก" : "เพิ่มอิโมจินี้"}
                            >
                              {reaction.emoji} {reaction.count}
                            </button>
                          ))}
                          <button
                            onClick={() => setEmojiFor(emojiFor === m.id ? null : m.id)}
                            className="rounded-full border border-white/10 px-1.5 py-0.5 text-[11px] text-slate-500 transition hover:border-indigo-400/40 hover:text-slate-200"
                            title="เพิ่มรีแอ็กชัน"
                          >
                            + 😊
                          </button>
                        </div>

                        {emojiFor === m.id ? (
                          <div className="mt-1 flex w-fit gap-0.5 rounded-xl border border-white/10 bg-slate-950/60 px-1.5 py-1">
                            {EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => void react(m.id, emoji)}
                                disabled={busyId === m.id}
                                className="rounded-lg px-1.5 py-1 text-base transition hover:bg-white/10"
                                aria-label={`รีแอ็กชัน ${emoji}`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
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
