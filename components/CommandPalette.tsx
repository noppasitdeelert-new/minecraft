"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/client";
import { Icon } from "./icons";

type PaletteResult = {
  kind: "member" | "message" | "announcement" | "task" | "resource" | "schedule" | "qa";
  id: number;
  title: string;
  subtitle: string | null;
  href: string;
};

const KIND_LABEL: Record<PaletteResult["kind"], { label: string; icon: string }> = {
  member: { label: "สมาชิก", icon: "user" },
  message: { label: "ข้อความแชต", icon: "chat" },
  announcement: { label: "ประกาศ", icon: "bell" },
  task: { label: "การบ้าน", icon: "tasks" },
  resource: { label: "ชีท/ไฟล์", icon: "file" },
  schedule: { label: "ตาราง", icon: "calendar" },
  qa: { label: "ถาม-ตอบ", icon: "help" },
};

const SHORTCUTS: PaletteResult[] = [
  { kind: "announcement", id: 0, title: "ประกาศปักหมุด", subtitle: "หน้าแรก", href: "/home#announcements" },
  { kind: "message", id: 0, title: "แชตห้อง", subtitle: "พูดคุยกับเพื่อน", href: "/chat" },
  { kind: "task", id: 0, title: "การบ้านของฉัน", subtitle: "ติดตามกำหนดส่ง", href: "/tasks" },
  { kind: "schedule", id: 0, title: "ตารางเรียนและตารางเวร", subtitle: "ทั้งสัปดาห์", href: "/schedule" },
  { kind: "resource", id: 0, title: "คลังชีทและไฟล์เรียน", subtitle: "คลังห้อง", href: "/hub#resources" },
  { kind: "member", id: 0, title: "ทำเนียบสมาชิก", subtitle: "ทุกคนในห้อง", href: "/members" },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setCursor(0);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiGet<{ results: PaletteResult[] }>(`/api/palette?q=${encodeURIComponent(q)}`);
        setResults(res.results);
        setCursor(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 260);
    return () => clearTimeout(timer);
  }, [query, open]);

  const items = query.trim().length < 2 ? SHORTCUTS : results;

  function go(item: PaletteResult) {
    close();
    router.push(item.href);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-slate-400 transition hover:border-indigo-400/30 hover:text-slate-200"
        title="ค้นหาทั้งเว็บ (Ctrl/⌘ + K)"
      >
        <Icon name="search" className="size-3.5" />
        <span className="hidden sm:inline">ค้นหาด่วน</span>
        <kbd className="rounded border border-white/15 px-1 font-mono text-[10px] text-slate-500">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/12 bg-[#0a1020] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/8 px-3.5 py-3">
          <Icon name="search" className="size-4 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((value) => Math.min(value + 1, Math.max(0, items.length - 1)));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((value) => Math.max(0, value - 1));
              } else if (event.key === "Enter" && items[cursor]) {
                event.preventDefault();
                go(items[cursor]);
              }
            }}
            placeholder="ค้นหาสมาชิก ข้อความ ประกาศ การบ้าน ชีท…"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">esc</kbd>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {loading ? <p className="px-3 py-4 text-xs text-slate-500">กำลังค้นหา…</p> : null}

          {!loading && items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-500">
              ไม่พบผลลัพธ์ — ลองใช้คำสั้นลง หรือค้นหาชื่อเพื่อนในห้อง
            </p>
          ) : null}

          {items.map((item, index) => {
            const meta = KIND_LABEL[item.kind];
            return (
              <button
                key={`${item.kind}-${item.id}-${index}`}
                type="button"
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(item)}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${
                  cursor === index ? "bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/25" : "hover:bg-white/5"
                }`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-300">
                  <Icon name={meta.icon} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-100">{item.title}</span>
                  {item.subtitle ? <span className="block truncate text-[11px] text-slate-500">{item.subtitle}</span> : null}
                </span>
                <span className="shrink-0 text-[10px] text-slate-500">{meta.label}</span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-white/8 px-3.5 py-2 text-[10px] text-slate-500">
          ↑↓ เลือก · Enter เปิด · Esc ปิด
        </div>
      </div>
    </div>
  );
}
