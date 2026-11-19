"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import type { Meeting, MeetingParticipant } from "@/lib/types";
import { Alert, Avatar, Empty, RoleBadge } from "./ui";
import { Icon } from "./icons";

type Detail = {
  meeting: {
    id: number;
    title: string;
    agenda: string | null;
    room_code: string;
    starts_at: string;
    status: string;
    notes: string | null;
    created_by: number;
  };
  participants: MeetingParticipant[];
  messages: Array<{ id: number; body: string; created_at: string; user_id: number; nickname: string; role: string; avatar_color: string }>;
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "รอเริ่ม", cls: "bg-sky-500/15 text-sky-300 ring-sky-400/30" },
  live: { label: "กำลังประชุม", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30" },
  ended: { label: "จบการประชุม", cls: "bg-slate-500/15 text-slate-400 ring-slate-400/30" },
};

export default function MeetingClient({
  meetings: initialMeetings,
  me,
  canCreate,
  jitsiDomain,
}: {
  meetings: Meeting[];
  me: { id: number; nickname: string; role: string; avatar_color: string };
  canCreate: boolean;
  jitsiDomain: string;
}) {
  const [meetings, setMeetings] = useState<Meeting[]>(initialMeetings);
  const [selectedId, setSelectedId] = useState<number>(initialMeetings.find((m) => m.status !== "ended")?.id ?? initialMeetings[0]?.id ?? 0);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [newMeeting, setNewMeeting] = useState({ title: "", agenda: "", starts_at: "" });
  const lastMsg = useRef(0);
  const notesDirty = useRef(false);
  const chatBox = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (id: number) => {
    try {
      const res = await apiGet<Detail>(`/api/meetings/${id}?afterMessage=${lastMsg.current}`);
      setDetail((prev) => {
        if (!prev || prev.meeting.id !== id) {
          return { ...res, messages: res.messages };
        }
        const merged = [...prev.messages, ...res.messages.filter((m) => !prev.messages.some((p) => p.id === m.id))];
        return { ...res, messages: merged };
      });
      if (res.messages.length) lastMsg.current = res.messages.at(-1)!.id;
      if (!notesDirty.current) setNotes(res.meeting.notes ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลการประชุมไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    lastMsg.current = 0;
    notesDirty.current = false;
    setDetail(null);
    setNotesSaved(true);
    void (async () => {
      await apiPost(`/api/meetings/${selectedId}`, { action: "join" }).catch(() => null);
      await load(selectedId);
    })();
  }, [selectedId, load]);

  useEffect(() => {
    if (!selectedId) return;
    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      void load(selectedId);
      if (tick % 5 === 0) void apiPost(`/api/meetings/${selectedId}`, { action: "join" }).catch(() => null);
    }, 4000);
    return () => clearInterval(timer);
  }, [selectedId, load]);

  useEffect(() => {
    const el = chatBox.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detail?.messages.length]);

  async function act(payload: Record<string, unknown>) {
    if (!selectedId) return;
    setError(null);
    try {
      await apiPost(`/api/meetings/${selectedId}`, payload);
      await load(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ");
    }
  }

  async function sendChat(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await act({ action: "message", body: text });
  }

  async function saveNotes() {
    await act({ action: "notes", notes });
    notesDirty.current = false;
    setNotesSaved(true);
  }

  async function createMeeting(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const iso = newMeeting.starts_at ? new Date(`${newMeeting.starts_at}:00+07:00`).toISOString() : new Date().toISOString();
      await apiPost("/api/meetings", { ...newMeeting, starts_at: iso });
      const res = await apiGet<{ meetings: Meeting[] }>("/api/meetings");
      setMeetings(res.meetings);
      setCreating(false);
      setNewMeeting({ title: "", agenda: "", starts_at: "" });
      setSelectedId(res.meetings[0]?.id ?? selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างห้องประชุมไม่สำเร็จ");
    }
  }

  const status = detail?.meeting.status ?? "scheduled";
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.scheduled;
  const isHost = detail ? detail.meeting.created_by === me.id : false;
  const raised = detail?.participants.find((p) => p.user_id === me.id)?.hand_raised === 1;
  const canEditNotes = canCreate || isHost;

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {/* Selector / controls */}
      <div className="card flex flex-wrap items-center gap-3 p-3.5">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          className="input max-w-xs flex-1"
          aria-label="เลือกห้องประชุม"
        >
          {meetings.length === 0 ? <option value={0}>ยังไม่มีการประชุม</option> : null}
          {meetings.map((m) => (
            <option key={m.id} value={m.id}>
              {m.status === "live" ? "🔴 " : ""}
              {m.title} · {formatDateTime(m.starts_at)}
            </option>
          ))}
        </select>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
        <button onClick={() => setRaisedAction()} className={`btn btn-sm ${raised ? "btn-primary" : "btn-ghost"}`}>
          <Icon name="hand" className="size-3.5" /> {raised ? "ยกมืออยู่" : "ยกมือ"}
        </button>
        {canCreate ? (
          <button onClick={() => setCreating((v) => !v)} className="btn btn-ghost btn-sm">
            <Icon name="plus" className="size-3.5" /> สร้างห้องประชุม
          </button>
        ) : null}
        {canCreate && status !== "ended" ? (
          <button
            onClick={() => act({ action: "status", status: status === "live" ? "ended" : "live" })}
            className="btn btn-ghost btn-sm"
          >
            {status === "live" ? "จบการประชุม" : "เริ่มการประชุม"}
          </button>
        ) : null}
      </div>

      {creating ? (
        <form onSubmit={createMeeting} className="card space-y-2.5 p-4">
          <input
            className="input"
            placeholder="หัวข้อประชุม เช่น ประชุมวางแผนทริปห้อง"
            value={newMeeting.title}
            onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
            required
          />
          <textarea
            className="input min-h-16"
            placeholder="วาระการประชุม (ไม่บังคับ)"
            value={newMeeting.agenda}
            onChange={(e) => setNewMeeting({ ...newMeeting, agenda: e.target.value })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              className="input max-w-xs"
              value={newMeeting.starts_at}
              onChange={(e) => setNewMeeting({ ...newMeeting, starts_at: e.target.value })}
            />
            <button className="btn btn-primary btn-sm">สร้าง</button>
            <button type="button" onClick={() => setCreating(false)} className="btn btn-ghost btn-sm">
              ยกเลิก
            </button>
          </div>
        </form>
      ) : null}

      {!detail ? (
        <div className="card p-6">
          {meetings.length === 0 ? (
            <Empty icon="video" title="ยังไม่มีห้องประชุม" hint="แอดมินสามารถสร้างห้องประชุมใหม่ได้จากปุ่มด้านบน" />
          ) : (
            <div className="h-64 animate-pulse rounded-xl bg-white/5" />
          )}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
          <div className="space-y-4">
            {/* Video */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-white/8 px-4 py-2.5">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-white">{detail.meeting.title}</h2>
                  <p className="truncate text-[11px] text-slate-500">
                    โดย {detail.meeting.agenda ? detail.meeting.agenda : "ไม่ได้ระบุวาระ"} · {formatDateTime(detail.meeting.starts_at)}
                  </p>
                </div>
                <span className="hidden text-[10px] text-slate-500 sm:block">{jitsiDomain}</span>
              </div>
              <div className="relative aspect-video w-full bg-black/60">
                {status === "ended" ? (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/85 text-center">
                    <span className="rounded-full bg-white/5 p-3 text-slate-400">
                      <Icon name="video" />
                    </span>
                    <p className="text-sm font-medium text-slate-200">การประชุมสิ้นสุดแล้ว</p>
                    <p className="text-xs text-slate-500">ยังอ่านบันทึกสรุปผลและประวัติแชตได้ด้านล่าง</p>
                  </div>
                ) : null}
                <iframe
                  key={detail.meeting.room_code}
                  title="SKC105 Meeting"
                  src={`https://${jitsiDomain}/${detail.meeting.room_code}#userInfo.displayName=%22${encodeURIComponent(me.nickname)}%22&config.prejoinPageEnabled=false`}
                  allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
                  className="h-full w-full border-0"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="card p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Icon name="edit" className="size-4 text-indigo-300" /> บันทึกสรุปการประชุม (Meeting Notes)
                </h3>
                {canEditNotes ? (
                  <button onClick={saveNotes} className="btn btn-primary btn-sm" disabled={notesSaved}>
                    {notesSaved ? "บันทึกแล้ว" : "บันทึก"}
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-500">อ่านได้อย่างเดียว</span>
                )}
              </div>
              <textarea
                className="input min-h-32 resize-y font-mono text-[13px] leading-relaxed"
                placeholder="สรุปประเด็น ข้อตกลง และผู้รับผิดชอบ..."
                value={notes}
                readOnly={!canEditNotes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  notesDirty.current = true;
                  setNotesSaved(false);
                }}
              />
            </div>
          </div>

          <div className="space-y-4">
            {/* Participants */}
            <div className="card p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Icon name="users" className="size-4 text-indigo-300" /> ผู้เข้าร่วม ({detail.participants.length})
                </h3>
                <span className="text-[10px] text-slate-500">อัปเดตอัตโนมัติ</span>
              </div>
              {detail.participants.length === 0 ? (
                <Empty icon="users" title="ยังไม่มีผู้เข้าร่วม" />
              ) : (
                <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                  {detail.participants.map((p) => (
                    <li key={p.user_id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
                      <Avatar name={p.nickname} color={p.avatar_color} size={26} />
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{p.nickname}</span>
                      <RoleBadge role={p.role} className="!px-1.5 !py-0 !text-[9px]" />
                      {p.hand_raised ? <span title="ยกมือ">✋</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* In-meeting chat */}
            <div className="card flex flex-col p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                <Icon name="chat" className="size-4 text-indigo-300" /> แชตระหว่างประชุม
              </h3>
              <div ref={chatBox} className="chat-scroll mb-2 h-48 space-y-2 pr-1">
                {detail.messages.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">ยังไม่มีข้อความ</p>
                ) : (
                  detail.messages.map((m) => (
                    <div key={m.id} className="text-xs">
                      <span className="font-semibold text-indigo-300">{m.nickname}</span>
                      <span className="ml-1.5 text-[10px] text-slate-600">
                        {new Date(m.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <p className="mt-0.5 break-words text-slate-300">{m.body}</p>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={sendChat} className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="พิมพ์ข้อความ..."
                  maxLength={1000}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button className="btn btn-primary !px-3" aria-label="ส่ง">
                  <Icon name="send" className="size-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function setRaisedAction() {
    void act({ action: "hand", raised: !raised });
  }
}
