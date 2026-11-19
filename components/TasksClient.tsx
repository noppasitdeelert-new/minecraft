"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/client";
import { dueLabel } from "@/lib/format";
import { TASK_STATUS_LABEL, TASK_STATUS_STYLE } from "@/lib/labels";
import type { Task } from "@/lib/types";
import { Alert, Avatar, Empty, RoleBadge } from "./ui";
import { Icon } from "./icons";

const STATUSES: Array<Task["my_status"]> = ["todo", "doing", "done"];

export default function TasksClient({ me, canManage }: { me: { id: number; role: string }; canManage: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "done">("open");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [composer, setComposer] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [form, setForm] = useState({ subject: "", title: "", description: "", due_date: "" });

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ tasks: Task[] }>("/api/tasks");
      setTasks(res.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดรายการงานไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const subjects = useMemo(() => Array.from(new Set(tasks.map((t) => t.subject))), [tasks]);

  const visible = tasks.filter((t) => {
    if (filter === "open" && t.my_status === "done") return false;
    if (filter === "done" && t.my_status !== "done") return false;
    if (subjectFilter !== "all" && t.subject !== subjectFilter) return false;
    return true;
  });

  async function setStatus(task: Task, status: Task["my_status"]) {
    setBusyId(task.id);
    setError(null);
    try {
      await apiPatch("/api/tasks", { id: task.id, status });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                my_status: status,
                done_count: t.done_count + (status === "done" ? 1 : 0) - (t.my_status === "done" ? 1 : 0),
                doing_count: t.doing_count + (status === "doing" ? 1 : 0) - (t.my_status === "doing" ? 1 : 0),
              }
            : t,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปเดตสถานะไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await apiPost("/api/tasks", form);
      setForm({ subject: "", title: "", description: "", due_date: "" });
      setComposer(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มงานไม่สำเร็จ");
    }
  }

  async function remove(task: Task) {
    if (!confirm(`ลบงาน "${task.title}"?`)) return;
    try {
      await apiDelete(`/api/tasks?id=${task.id}`);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบงานไม่สำเร็จ");
    }
  }

  const openCount = tasks.filter((t) => t.my_status !== "done").length;
  const doneCount = tasks.filter((t) => t.my_status === "done").length;

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="flex rounded-lg bg-white/5 p-1 text-xs">
          {[
            { key: "open", label: `ยังไม่เสร็จ (${openCount})` },
            { key: "done", label: `เสร็จแล้ว (${doneCount})` },
            { key: "all", label: "ทั้งหมด" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as typeof filter)}
              className={`rounded-md px-3 py-1.5 font-medium transition ${
                filter === tab.key ? "bg-indigo-500/20 text-white ring-1 ring-inset ring-indigo-400/30" : "text-slate-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="input ml-auto w-auto py-1.5 text-xs">
          <option value="all">ทุกรายวิชา</option>
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <button onClick={() => setComposer((v) => !v)} className="btn btn-primary btn-sm">
          <Icon name="plus" className="size-3.5" /> เพิ่มงาน
        </button>
      </div>

      {composer ? (
        <form onSubmit={create} className="card space-y-2.5 border-indigo-400/25 bg-indigo-500/[0.06] p-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <input
              className="input"
              placeholder="รายวิชา เช่น คณิตศาสตร์"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
            />
            <input
              className="input"
              placeholder="ชื่องาน / การบ้าน"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <textarea
            className="input min-h-16"
            placeholder="รายละเอียด คำสั่ง หรือสิ่งที่ต้องส่ง"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              กำหนดส่ง
              <input
                type="date"
                className="input w-auto py-1.5 text-xs"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </label>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setComposer(false)} className="btn btn-ghost btn-sm">
                ยกเลิก
              </button>
              <button className="btn btn-primary btn-sm">บันทึกงาน</button>
            </div>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Empty icon="tasks" title="ไม่พบงานในหมวดนี้" hint="ลองเปลี่ยนตัวกรอง หรือเพิ่มงานใหม่" />
      ) : (
        <ul className="space-y-2.5">
          {visible.map((t) => {
            const due = dueLabel(t.due_date);
            const percent = t.total_members > 0 ? Math.round((t.done_count / t.total_members) * 100) : 0;
            return (
              <li key={t.id} className="card card-hover p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge bg-indigo-500/15 text-indigo-300 ring-indigo-400/30">{t.subject}</span>
                      <span
                        className={`badge ${
                          due.tone === "overdue"
                            ? "bg-rose-500/15 text-rose-300 ring-rose-400/30"
                            : due.tone === "soon"
                              ? "bg-amber-500/15 text-amber-300 ring-amber-400/30"
                              : "bg-slate-500/15 text-slate-300 ring-slate-400/30"
                        }`}
                      >
                        {due.text}
                      </span>
                      <span className={`badge ${TASK_STATUS_STYLE[t.my_status]}`}>ของฉัน: {TASK_STATUS_LABEL[t.my_status]}</span>
                    </div>
                    <h3 className={`mt-1.5 text-sm font-semibold ${t.my_status === "done" ? "text-slate-400 line-through" : "text-white"}`}>
                      {t.title}
                    </h3>
                    {t.description ? <p className="prose-body mt-1 line-clamp-2">{t.description}</p> : null}

                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400" style={{ width: `${percent}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {t.done_count}/{t.total_members} คนเสร็จ ({percent}%)
                      </span>
                    </div>
                  </div>

                  <div className="flex w-full flex-col items-end gap-2 sm:w-auto">
                    <div className="flex rounded-lg bg-white/5 p-0.5">
                      {STATUSES.map((s) => (
                        <button
                          key={s}
                          disabled={busyId === t.id}
                          onClick={() => setStatus(t, s)}
                          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                            t.my_status === s ? "bg-indigo-500/25 text-white" : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {TASK_STATUS_LABEL[s]}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <Avatar name={t.author.nickname} color={t.author.avatar_color} size={18} />
                      {t.author.nickname}
                      <RoleBadge role={t.author.role} className="!px-1.5 !py-0 !text-[9px]" />
                      {canManage || t.author.id === me.id ? (
                        <button onClick={() => remove(t)} className="rounded p-1 text-slate-500 hover:text-rose-300" title="ลบงาน">
                          <Icon name="trash" className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
