"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/client";
import { ATTENDANCE_LABEL, ATTENDANCE_STYLE } from "@/lib/labels";
import type { AttendanceRecord } from "@/lib/types";
import { Alert, Avatar } from "./ui";
import { Icon } from "./icons";

type Res = {
  date: string;
  today: string;
  records: AttendanceRecord[];
  summary: Record<string, number>;
  mine: AttendanceRecord | null;
  total: number;
};

const OPTIONS: Array<{ value: string; label: string; icon: string }> = [
  { value: "present", label: "มาเรียน", icon: "check" },
  { value: "late", label: "มาสาย", icon: "clock" },
  { value: "sick", label: "ลาป่วย", icon: "help" },
  { value: "leave", label: "ลากิจ", icon: "file" },
];

export default function AttendanceWidget({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<Res | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showList, setShowList] = useState(!compact);

  const load = useCallback(async () => {
    try {
      setData(await apiGet<Res>("/api/attendance"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkIn(status: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/attendance", { status });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกสถานะไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const mine = data?.mine;
  const present = (data?.summary.present ?? 0) + (data?.summary.late ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-slate-400">
            เช็กชื่อวันนี้ ·{" "}
            <span className="text-slate-300">
              {present}/{data?.total ?? 0} คน
            </span>
          </p>
          {mine?.status ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
              สถานะของคุณ:
              <span className={`badge ${ATTENDANCE_STYLE[mine.status] ?? ""}`}>{ATTENDANCE_LABEL[mine.status] ?? mine.status}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-amber-300/90">คุณยังไม่ได้แจ้งสถานะวันนี้</p>
          )}
        </div>
        <button onClick={() => setShowList((v) => !v)} className="btn btn-ghost btn-sm">
          <Icon name="users" className="size-3.5" />
          {showList ? "ซ่อนรายชื่อ" : "ดูรายชื่อ"}
        </button>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OPTIONS.map((opt) => {
          const active = mine?.status === opt.value;
          return (
            <button
              key={opt.value}
              disabled={busy}
              onClick={() => checkIn(opt.value)}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-medium transition ${
                active
                  ? "border-indigo-400/50 bg-indigo-500/20 text-white"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-indigo-400/30 hover:bg-white/[0.07]"
              }`}
            >
              <Icon name={opt.icon} className="size-4" />
              {opt.label}
            </button>
          );
        })}
      </div>

      {showList ? (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {(data?.records ?? []).map((r) => (
            <li key={r.user_id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
              <Avatar name={r.nickname} color={r.avatar_color} size={24} />
              <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{r.nickname}</span>
              {r.status ? (
                <span className={`badge ${ATTENDANCE_STYLE[r.status] ?? ""}`}>{ATTENDANCE_LABEL[r.status] ?? r.status}</span>
              ) : (
                <span className="text-[11px] text-slate-500">ยังไม่เช็กชื่อ</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
