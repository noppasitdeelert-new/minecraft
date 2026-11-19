"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/client";
import { formatDateShort } from "@/lib/format";
import { RESOURCE_CATEGORY_LABEL } from "@/lib/labels";
import type { Resource } from "@/lib/types";
import { Alert, Avatar, Empty } from "../ui";
import { Icon } from "../icons";

export default function ResourcesPanel({ me, canManage }: { me: { id: number; role: string }; canManage: boolean }) {
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState(false);
  const [category, setCategory] = useState("all");
  const [form, setForm] = useState({ title: "", url: "", description: "", category: "sheet", subject: "" });

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ resources: Resource[] }>("/api/resources");
      setItems(res.resources);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดคลังไฟล์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => (category === "all" ? items : items.filter((i) => i.category === category)), [items, category]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await apiPost("/api/resources", form);
      setForm({ title: "", url: "", description: "", category: "sheet", subject: "" });
      setComposer(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มไฟล์ไม่สำเร็จ");
    }
  }

  async function remove(item: Resource) {
    if (!confirm(`ลบ "${item.title}"?`)) return;
    try {
      await apiDelete(`/api/resources?id=${item.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {[{ key: "all", label: "ทั้งหมด" }, ...Object.entries(RESOURCE_CATEGORY_LABEL).map(([key, label]) => ({ key, label }))].map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                category === c.key ? "bg-indigo-500/20 text-white ring-1 ring-inset ring-indigo-400/30" : "bg-white/5 text-slate-400"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <button onClick={() => setComposer((v) => !v)} className="btn btn-primary btn-sm ml-auto">
          <Icon name="plus" className="size-3.5" /> แชร์ไฟล์/ลิงก์
        </button>
      </div>

      {composer ? (
        <form onSubmit={create} className="card space-y-2.5 border-indigo-400/25 bg-indigo-500/[0.06] p-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <input className="input" placeholder="ชื่อไฟล์ / ชีทสรุป" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <input className="input" placeholder="ลิงก์ (https://...)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required />
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {Object.entries(RESOURCE_CATEGORY_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <input className="input" placeholder="รายวิชา" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <textarea
            className="input min-h-14"
            placeholder="คำอธิบายสั้น ๆ"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setComposer(false)} className="btn btn-ghost btn-sm">
              ยกเลิก
            </button>
            <button className="btn btn-primary btn-sm">บันทึก</button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="h-28 animate-pulse rounded-2xl bg-white/5" />
      ) : visible.length === 0 ? (
        <Empty icon="file" title="ยังไม่มีไฟล์ในหมวดนี้" hint="แชร์ลิงก์ชีทสรุปหรือข้อสอบเก่าให้เพื่อน ๆ ได้เลย" />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {visible.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="card card-hover group flex items-start gap-3 p-3.5"
            >
              <span className="rounded-xl bg-indigo-500/10 p-2 text-indigo-300">
                <Icon name={item.category === "video" ? "video" : item.category === "exam" ? "tasks" : "file"} className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-100 group-hover:text-white">{item.title}</p>
                {item.description ? <p className="line-clamp-2 text-[11px] text-slate-400">{item.description}</p> : null}
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                  <span className="badge bg-white/5 text-slate-300 ring-white/10">{RESOURCE_CATEGORY_LABEL[item.category] ?? item.category}</span>
                  {item.subject ? <span>· {item.subject}</span> : null}
                  <span>· {item.author.nickname}</span>
                  <span>· {formatDateShort(item.created_at)}</span>
                </p>
              </div>
              {item.author.id === me.id || canManage ? (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    void remove(item);
                  }}
                  className="rounded p-1 text-slate-600 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                  title="ลบ"
                >
                  <Icon name="trash" className="size-3.5" />
                </button>
              ) : (
                <span className="text-slate-600">
                  <Icon name="link" className="size-4" />
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
