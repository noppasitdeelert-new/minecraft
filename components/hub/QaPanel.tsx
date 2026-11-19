"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import type { QaPost } from "@/lib/types";
import { Alert, Avatar, Empty, RoleBadge } from "../ui";
import { Icon } from "../icons";

export default function QaPanel({ me, canManage }: { me: { id: number; role: string }; canManage: boolean }) {
  const [posts, setPosts] = useState<QaPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", subject: "" });
  const [openId, setOpenId] = useState<number | null>(null);
  const [answerDraft, setAnswerDraft] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ posts: QaPost[] }>("/api/qa");
      setPosts(res.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดกระทู้ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await apiPost("/api/qa", form);
      setForm({ title: "", body: "", subject: "" });
      setComposer(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตั้งกระทู้ไม่สำเร็จ");
    }
  }

  async function answer(post: QaPost) {
    const text = (answerDraft[post.id] ?? "").trim();
    if (!text) return;
    setError(null);
    try {
      await apiPost(`/api/qa/${post.id}`, { action: "answer", body: text });
      setAnswerDraft((prev) => ({ ...prev, [post.id]: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตอบกระทู้ไม่สำเร็จ");
    }
  }

  async function resolve(post: QaPost) {
    try {
      await apiPost(`/api/qa/${post.id}`, { action: "resolve", resolved: !post.resolved });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  async function remove(post: QaPost) {
    if (!confirm("ลบกระทู้นี้และคำตอบทั้งหมด?")) return;
    try {
      await apiDelete(`/api/qa/${post.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบกระทู้ไม่สำเร็จ");
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {composer ? (
        <form onSubmit={create} className="card space-y-2.5 border-indigo-400/25 bg-indigo-500/[0.06] p-4">
          <input className="input" placeholder="หัวข้อคำถาม เช่น สูตร trig บทที่ 4 ใช้ยังไง" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <textarea className="input min-h-20" placeholder="อธิบายโจทย์หรือจุดที่ไม่เข้าใจ" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
          <div className="flex flex-wrap items-center gap-2">
            <input className="input max-w-48" placeholder="รายวิชา (ไม่บังคับ)" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setComposer(false)} className="btn btn-ghost btn-sm">
                ยกเลิก
              </button>
              <button className="btn btn-primary btn-sm">ตั้งกระทู้</button>
            </div>
          </div>
        </form>
      ) : (
        <button onClick={() => setComposer(true)} className="btn btn-ghost w-full border-dashed">
          <Icon name="help" className="size-4" /> ถามการบ้าน / ตั้งกระทู้ใหม่
        </button>
      )}

      {loading ? (
        <div className="h-28 animate-pulse rounded-2xl bg-white/5" />
      ) : posts.length === 0 ? (
        <Empty icon="help" title="ยังไม่มีกระทู้ถาม-ตอบ" hint="เป็นคนแรกที่ถามเพื่อน ๆ ในห้อง" />
      ) : (
        posts.map((post) => {
          const expanded = openId === post.id;
          return (
            <article key={post.id} className="card p-4">
              <button onClick={() => setOpenId(expanded ? null : post.id)} className="flex w-full items-start gap-3 text-left">
                <Avatar name={post.author.nickname} color={post.author.avatar_color} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-white">{post.title}</h3>
                    {post.resolved ? <span className="badge bg-emerald-500/15 text-emerald-300 ring-emerald-400/30">แก้ไขแล้ว</span> : null}
                    {post.subject ? <span className="badge bg-white/5 text-slate-300 ring-white/10">{post.subject}</span> : null}
                  </div>
                  <p className={`mt-0.5 text-xs text-slate-400 ${expanded ? "" : "line-clamp-2"}`}>{post.body}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                    {post.author.nickname}
                    <RoleBadge role={post.author.role} className="!px-1.5 !py-0 !text-[9px]" />
                    · {relativeTime(post.created_at)} · {post.answers.length} คำตอบ
                  </p>
                </div>
                <Icon name={expanded ? "close" : "chat"} className="mt-1 size-4 shrink-0 text-slate-500" />
              </button>

              {expanded ? (
                <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
                  {post.answers.map((a) => (
                    <div key={a.id} className="rounded-xl bg-white/[0.03] p-2.5">
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Avatar name={a.author.nickname} color={a.author.avatar_color} size={18} />
                        <span className="font-medium text-slate-200">{a.author.nickname}</span>
                        <RoleBadge role={a.author.role} className="!px-1.5 !py-0 !text-[9px]" />
                        <span className="ml-auto">{relativeTime(a.created_at)}</span>
                      </p>
                      <p className="prose-body mt-1">{a.body}</p>
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <input
                      className="input flex-1"
                      placeholder="พิมพ์คำตอบช่วยเพื่อน..."
                      value={answerDraft[post.id] ?? ""}
                      onChange={(e) => setAnswerDraft((prev) => ({ ...prev, [post.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void answer(post);
                        }
                      }}
                    />
                    <button onClick={() => answer(post)} className="btn btn-primary btn-sm">
                      ตอบ
                    </button>
                  </div>

                  {post.author.id === me.id || canManage ? (
                    <div className="flex gap-2 text-[11px]">
                      <button onClick={() => resolve(post)} className="text-indigo-300 hover:text-indigo-200">
                        {post.resolved ? "เปิดกระทู้อีกครั้ง" : "ทำเครื่องหมายว่าแก้ไขแล้ว"}
                      </button>
                      <button onClick={() => remove(post)} className="ml-auto text-rose-400 hover:text-rose-300">
                        ลบกระทู้
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })
      )}
    </div>
  );
}
