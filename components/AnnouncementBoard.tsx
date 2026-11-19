"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/client";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { Announcement } from "@/lib/types";
import { Alert, Avatar, Empty, RoleBadge } from "./ui";
import { Icon } from "./icons";

export default function AnnouncementBoard({ canPost, limit }: { canPost: boolean; limit?: number }) {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", pinned: false, important: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ announcements: Announcement[] }>("/api/announcements");
      setItems(res.announcements);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดประกาศไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/announcements", form);
      setForm({ title: "", body: "", pinned: false, important: false });
      setComposerOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "โพสต์ประกาศไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: Announcement, field: "pinned" | "important") {
    setError(null);
    try {
      await apiPatch("/api/announcements", { id: item.id, [field]: !item[field] });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "แก้ไขประกาศไม่สำเร็จ");
    }
  }

  async function remove(id: number) {
    if (!confirm("ลบประกาศนี้?")) return;
    try {
      await apiDelete(`/api/announcements?id=${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบประกาศไม่สำเร็จ");
    }
  }

  const visible = limit ? items.slice(0, limit) : items;

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {canPost ? (
        composerOpen ? (
          <form onSubmit={submit} className="space-y-2.5 rounded-xl border border-indigo-400/25 bg-indigo-500/[0.07] p-3.5">
            <input
              className="input"
              placeholder="หัวข้อประกาศ"
              maxLength={140}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
            <textarea
              className="input min-h-24 resize-y"
              placeholder="รายละเอียดประกาศ..."
              maxLength={8000}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              required
            />
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="size-3.5 accent-indigo-500"
                  checked={form.pinned}
                  onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                />
                ปักหมุด
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  className="size-3.5 accent-indigo-500"
                  checked={form.important}
                  onChange={(e) => setForm({ ...form, important: e.target.checked })}
                />
                สำคัญ (แจ้งเตือน Discord / LINE)
              </label>
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={() => setComposerOpen(false)} className="btn btn-ghost btn-sm">
                  ยกเลิก
                </button>
                <button className="btn btn-primary btn-sm" disabled={busy}>
                  {busy ? "กำลังโพสต์..." : "โพสต์ประกาศ"}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <button onClick={() => setComposerOpen(true)} className="btn btn-ghost w-full border-dashed">
            <Icon name="plus" className="size-4" /> เขียนประกาศใหม่
          </button>
        )
      ) : null}

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Empty icon="bell" title="ยังไม่มีประกาศ" hint="ประกาศจากแอดมินจะแสดงที่นี่" />
      ) : (
        visible.map((a) => (
          <article key={a.id} className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {a.pinned ? <span className="badge bg-indigo-500/15 text-indigo-300 ring-indigo-400/30">📌 ปักหมุด</span> : null}
              {a.important ? <span className="badge bg-rose-500/15 text-rose-300 ring-rose-400/30">สำคัญ</span> : null}
              <h3 className="text-sm font-semibold text-white">{a.title}</h3>
              {canPost ? (
                <span className="ml-auto flex gap-1">
                  <button
                    onClick={() => toggle(a, "pinned")}
                    className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-indigo-300"
                    title={a.pinned ? "เลิกปักหมุด" : "ปักหมุด"}
                  >
                    <Icon name="pin" className="size-3.5" />
                  </button>
                  <button
                    onClick={() => toggle(a, "important")}
                    className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-amber-300"
                    title="สลับสถานะสำคัญ"
                  >
                    <Icon name="bell" className="size-3.5" />
                  </button>
                  <button
                    onClick={() => remove(a.id)}
                    className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-rose-300"
                    title="ลบประกาศ"
                  >
                    <Icon name="trash" className="size-3.5" />
                  </button>
                </span>
              ) : null}
            </div>
            <p className="prose-body mt-1.5">{a.body}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <Avatar name={a.author.nickname} color={a.author.avatar_color} size={20} />
              <span className="text-slate-400">{a.author.nickname}</span>
              <RoleBadge role={a.author.role} className="!px-1.5 !py-0 !text-[9px]" />
              <span className="ml-auto" title={relativeTime(a.created_at)}>
                {formatDateTime(a.created_at)}
              </span>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
