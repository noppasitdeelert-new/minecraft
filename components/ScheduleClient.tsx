"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/client";
import { currentWeekday, formatClockTime, formatDate, todayBangkok } from "@/lib/format";
import { DAY_LABEL } from "@/lib/labels";
import type { ScheduleEntry } from "@/lib/types";
import AttendanceWidget from "./AttendanceWidget";
import { Alert, Empty } from "./ui";
import { Icon } from "./icons";

const TABS = [
  { key: "classes", label: "ตารางเรียน", icon: "calendar" },
  { key: "duties", label: "ตารางเวร", icon: "check" },
  { key: "events", label: "นัดหมายสำคัญ", icon: "bell" },
  { key: "attendance", label: "เช็กชื่อ", icon: "users" },
] as const;

export default function ScheduleClient({ canManage, currentUserId }: { canManage: boolean; currentUserId: number }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("classes");
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState(false);
  const [form, setForm] = useState({
    kind: "class" as "class" | "duty" | "event",
    title: "",
    subject: "",
    location: "",
    day_of_week: String(currentWeekday()),
    start_time: "",
    end_time: "",
    date: "",
    note: "",
  });

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ entries: ScheduleEntry[] }>("/api/schedule");
      setEntries(res.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดตารางไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canDelete = (entry: ScheduleEntry) => canManage || entry.created_by === currentUserId;

  const today = currentWeekday();
  const classes = useMemo(() => entries.filter((e) => e.kind === "class"), [entries]);
  const duties = useMemo(() => entries.filter((e) => e.kind === "duty"), [entries]);
  const events = useMemo(
    () => entries.filter((e) => e.kind === "event").sort((a, b) => String(a.date).localeCompare(String(b.date))),
    [entries],
  );

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await apiPost("/api/schedule", form);
      setForm({ ...form, title: "", subject: "", location: "", start_time: "", end_time: "", date: "", note: "" });
      setComposer(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มรายการไม่สำเร็จ");
    }
  }

  async function remove(id: number) {
    if (!confirm("ลบรายการนี้?")) return;
    try {
      await apiDelete(`/api/schedule?id=${id}`);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="card flex flex-wrap items-center gap-2 p-2.5">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition ${
                tab === t.key ? "bg-indigo-500/20 text-white ring-1 ring-inset ring-indigo-400/30" : "text-slate-400 hover:bg-white/5"
              }`}
            >
              <Icon name={t.icon} className="size-3.5" />
              {t.label}
            </button>
          ))}
        </div>
        {tab !== "attendance" ? (
          <button onClick={() => setComposer((v) => !v)} className="btn btn-ghost btn-sm ml-auto">
            <Icon name="plus" className="size-3.5" /> เพิ่มรายการ
          </button>
        ) : null}
      </div>

      {composer ? (
        <form onSubmit={create} className="card space-y-2.5 border-indigo-400/25 bg-indigo-500/[0.06] p-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <select
              className="input"
              value={form.kind}
              onChange={(e) => {
                const kind = e.target.value as typeof form.kind;
                setForm({ ...form, kind });
                setTab(kind === "class" ? "classes" : kind === "duty" ? "duties" : "events");
              }}
            >
              <option value="class">คาบเรียน</option>
              <option value="duty">ตารางเวร</option>
              <option value="event">นัดหมาย / กิจกรรม</option>
            </select>
            <input
              className="input"
              placeholder={form.kind === "class" ? "ชื่อวิชา" : form.kind === "duty" ? "หน้าที่เวร" : "ชื่อนัดหมาย"}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>

          {form.kind !== "event" ? (
            <div className="grid gap-2.5 sm:grid-cols-4">
              <select className="input" value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}>
                {Object.entries(DAY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    วัน{label}
                  </option>
                ))}
              </select>
              {form.kind === "class" ? (
                <>
                  <input className="input" placeholder="ชื่อผู้สอน/หมายเหตุ" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                  <input type="time" className="input" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                  <input type="time" className="input" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
                </>
              ) : (
                <input className="input sm:col-span-3" placeholder="หมายเหตุ" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              )}
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              <input className="input" placeholder="สถานที่ / รายละเอียด" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setComposer(false)} className="btn btn-ghost btn-sm">
              ยกเลิก
            </button>
            <button className="btn btn-primary btn-sm">บันทึก</button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
      ) : tab === "classes" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(DAY_LABEL).map(([day, label]) => {
            const list = classes.filter((c) => c.day_of_week === Number(day));
            const isToday = Number(day) === today;
            if (list.length === 0) return null;
            return (
              <div key={day} className={`card p-4 ${isToday ? "ring-1 ring-indigo-400/40" : ""}`}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">วัน{label}</h3>
                  {isToday ? <span className="badge bg-indigo-500/15 text-indigo-300 ring-indigo-400/30">วันนี้</span> : null}
                </div>
                <ul className="space-y-2">
                  {list.map((c) => (
                    <li key={c.id} className="group flex items-start gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                      <div className="w-12 shrink-0 text-center">
                        <p className="font-mono text-[11px] font-semibold text-indigo-300">{formatClockTime(c.start_time)}</p>
                        <p className="font-mono text-[10px] text-slate-500">{formatClockTime(c.end_time)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-100">{c.title}</p>
                        <p className="truncate text-[11px] text-slate-500">{[c.subject, c.location].filter(Boolean).join(" · ")}</p>
                      </div>
                      {canDelete(c) ? (
                        <button onClick={() => remove(c.id)} className="text-slate-600 hover:text-rose-400 sm:opacity-0 sm:group-hover:opacity-100">
                          <Icon name="trash" className="size-3.5" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {classes.length === 0 ? <div className="md:col-span-2 xl:col-span-3"><Empty icon="calendar" title="ยังไม่มีตารางเรียน" /></div> : null}
        </div>
      ) : tab === "duties" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(DAY_LABEL).map(([day, label]) => {
            const list = duties.filter((d) => d.day_of_week === Number(day));
            return (
              <div key={day} className={`card p-4 ${Number(day) === today ? "ring-1 ring-amber-400/40" : ""}`}>
                <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-white">
                  วัน{label}
                  {Number(day) === today ? <span className="badge bg-amber-500/15 text-amber-300 ring-amber-400/30">วันนี้</span> : null}
                </h3>
                {list.length === 0 ? (
                  <p className="text-xs text-slate-500">ไม่มีเวร</p>
                ) : (
                  <ul className="space-y-1.5">
                    {list.map((d) => (
                      <li key={d.id} className="group flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-200">
                        <span className="text-amber-300">🧹</span>
                        <span className="flex-1">{d.title}</span>
                        {canDelete(d) ? (
                          <button onClick={() => remove(d.id)} className="text-slate-600 hover:text-rose-400 sm:opacity-0 sm:group-hover:opacity-100">
                            <Icon name="trash" className="size-3" />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : tab === "events" ? (
        <div className="space-y-2.5">
          {events.length === 0 ? <Empty icon="bell" title="ยังไม่มีนัดหมาย" hint="สมาชิกทุกคนเพิ่มกิจกรรมหรือวันสอบได้" /> : null}
          {events.map((e) => {
            const days = Math.ceil(
              (new Date(`${e.date}T00:00:00+07:00`).getTime() - new Date(`${todayBangkok()}T00:00:00+07:00`).getTime()) / 86400000,
            );
            return (
              <div key={e.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="flex size-12 flex-col items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-200">
                  <span className="text-[10px]">{formatDate(e.date).split(" ")[1] ?? ""}</span>
                  <span className="text-sm font-bold">{formatDate(e.date).split(" ")[0] ?? ""}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{e.title}</p>
                  <p className="text-[11px] text-slate-500">
                    {formatDate(e.date)}
                    {e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>
                <span
                  className={`badge ${
                    days < 0
                      ? "bg-slate-500/15 text-slate-400 ring-slate-400/30"
                      : days <= 3
                        ? "bg-amber-500/15 text-amber-300 ring-amber-400/30"
                        : "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
                  }`}
                >
                  {days < 0 ? "ผ่านไปแล้ว" : days === 0 ? "วันนี้!" : `อีก ${days} วัน`}
                </span>
                {canDelete(e) ? (
                  <button onClick={() => remove(e.id)} className="rounded p-1.5 text-slate-500 hover:text-rose-300">
                    <Icon name="trash" className="size-3.5" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card p-5">
          <AttendanceWidget />
        </div>
      )}
    </div>
  );
}
