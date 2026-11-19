"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import type { Poll } from "@/lib/types";
import { Alert, Avatar, Empty, RoleBadge } from "../ui";
import { Icon } from "../icons";

export default function PollsPanel({ me, canManage }: { me: { id: number; role: string }; canManage: boolean }) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState(false);
  const [form, setForm] = useState({ question: "", description: "", options: ["", ""] });

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ polls: Poll[] }>("/api/polls");
      setPolls(res.polls);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดโพลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function vote(poll: Poll, optionId: number) {
    setError(null);
    try {
      await apiPost(`/api/polls/${poll.id}`, { action: "vote", option_id: optionId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหวตไม่สำเร็จ");
    }
  }

  async function toggleStatus(poll: Poll) {
    try {
      await apiPost(`/api/polls/${poll.id}`, { action: poll.status === "open" ? "close" : "reopen" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  async function remove(poll: Poll) {
    if (!confirm(`ลบโพล "${poll.question}"?`)) return;
    try {
      await apiDelete(`/api/polls/${poll.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบโพลไม่สำเร็จ");
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await apiPost("/api/polls", { ...form, options: form.options.filter((o) => o.trim()) });
      setForm({ question: "", description: "", options: ["", ""] });
      setComposer(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างโพลไม่สำเร็จ");
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {composer ? (
        <form onSubmit={create} className="card space-y-2.5 border-indigo-400/25 bg-indigo-500/[0.06] p-4">
          <input
            className="input"
            placeholder="คำถามที่ต้องการโหวต"
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
            required
          />
          <input
            className="input"
            placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="space-y-2">
            {form.options.map((opt, index) => (
              <div key={index} className="flex gap-2">
                <input
                  className="input"
                  placeholder={`ตัวเลือกที่ ${index + 1}`}
                  value={opt}
                  onChange={(e) => {
                    const options = [...form.options];
                    options[index] = e.target.value;
                    setForm({ ...form, options });
                  }}
                  required={index < 2}
                />
                {form.options.length > 2 ? (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, options: form.options.filter((_, i) => i !== index) })}
                    className="btn btn-ghost btn-sm"
                  >
                    <Icon name="trash" className="size-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {form.options.length < 10 ? (
              <button
                type="button"
                onClick={() => setForm({ ...form, options: [...form.options, ""] })}
                className="btn btn-ghost btn-sm"
              >
                <Icon name="plus" className="size-3.5" /> เพิ่มตัวเลือก
              </button>
            ) : null}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setComposer(false)} className="btn btn-ghost btn-sm">
                ยกเลิก
              </button>
              <button className="btn btn-primary btn-sm">สร้างโพล</button>
            </div>
          </div>
        </form>
      ) : (
        <button onClick={() => setComposer(true)} className="btn btn-ghost w-full border-dashed">
          <Icon name="plus" className="size-4" /> สร้างโพลใหม่
        </button>
      )}

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-white/5" />
      ) : polls.length === 0 ? (
        <Empty icon="chart" title="ยังไม่มีโพล" hint="สร้างโพลแรกเพื่อถามความเห็นของห้อง" />
      ) : (
        polls.map((poll) => {
          const maxVotes = Math.max(1, ...poll.options.map((o) => o.votes));
          const voted = poll.my_option_id !== null;
          const owner = poll.author.id === me.id || canManage;
          return (
            <article key={poll.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-white">{poll.question}</h3>
                  {poll.description ? <p className="mt-0.5 text-xs text-slate-400">{poll.description}</p> : null}
                </div>
                <span
                  className={`badge ${
                    poll.status === "open"
                      ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
                      : "bg-slate-500/15 text-slate-400 ring-slate-400/30"
                  }`}
                >
                  {poll.status === "open" ? "เปิดโหวต" : "ปิดแล้ว"}
                </span>
                {owner ? (
                  <div className="flex gap-1">
                    <button onClick={() => toggleStatus(poll)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-indigo-300" title="เปิด/ปิดโหวต">
                      <Icon name="clock" className="size-3.5" />
                    </button>
                    <button onClick={() => remove(poll)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-rose-300" title="ลบโพล">
                      <Icon name="trash" className="size-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>

              <ul className="mt-3 space-y-1.5">
                {poll.options.map((opt) => {
                  const percent = poll.total_votes > 0 ? Math.round((opt.votes / poll.total_votes) * 100) : 0;
                  const chosen = poll.my_option_id === opt.id;
                  const reveal = voted || poll.status === "closed";
                  return (
                    <li key={opt.id}>
                      <button
                        onClick={() => !voted && poll.status === "open" && vote(poll, opt.id)}
                        disabled={voted || poll.status === "closed"}
                        className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-xs transition ${
                          chosen
                            ? "border-indigo-400/50 bg-indigo-500/10 text-white"
                            : "border-white/8 bg-white/[0.02] text-slate-300 hover:border-indigo-400/30"
                        } ${voted || poll.status === "closed" ? "cursor-default" : "cursor-pointer"}`}
                      >
                        {reveal ? (
                          <span
                            className="absolute inset-y-0 left-0 bg-indigo-500/15"
                            style={{ width: `${(opt.votes / maxVotes) * 100}%` }}
                          />
                        ) : null}
                        <span className="relative flex items-center gap-2">
                          <span className="flex-1 font-medium">{opt.label}</span>
                          {chosen ? <Icon name="check" className="size-3.5 text-indigo-300" /> : null}
                          {reveal ? (
                            <span className="text-[11px] text-slate-400">
                              {opt.votes} เสียง · {percent}%
                            </span>
                          ) : null}
                        </span>
                        {reveal && opt.voters.length > 0 ? (
                          <span className="relative mt-0.5 block truncate text-[10px] text-slate-500">{opt.voters.join(", ")}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <Avatar name={poll.author.nickname} color={poll.author.avatar_color} size={18} />
                {poll.author.nickname}
                <RoleBadge role={poll.author.role} className="!px-1.5 !py-0 !text-[9px]" />
                <span>· {poll.total_votes} เสียง</span>
                {!voted && poll.status === "open" ? <span className="text-amber-300">· เลือกได้ 1 ครั้งเท่านั้น</span> : null}
                <span className="ml-auto">{formatDateTime(poll.created_at)}</span>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
