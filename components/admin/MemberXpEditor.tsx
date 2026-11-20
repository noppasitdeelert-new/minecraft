"use client";

import { useState } from "react";
import { levelFromXp } from "@/lib/levels";
import type { AdminMember } from "@/lib/types";
import { Icon } from "../icons";

/** Inline XP adjuster + title grant used in the admin member table. */
export default function MemberXpEditor({
  member,
  onSave,
}: {
  member: AdminMember;
  onSave: (payload: { xpDelta?: number; title?: string }) => Promise<void>;
}) {
  const [delta, setDelta] = useState("10");
  const [title, setTitle] = useState(member.title ?? "");
  const [busy, setBusy] = useState(false);

  async function adjust(sign: 1 | -1) {
    const amount = Math.abs(Math.trunc(Number(delta)));
    if (!amount) return;
    setBusy(true);
    try {
      await onSave({ xpDelta: sign * amount });
    } finally {
      setBusy(false);
    }
  }

  async function grantTitle() {
    setBusy(true);
    try {
      await onSave({ title });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <span className="font-mono text-[11px] font-semibold text-indigo-200">
          {member.xp} XP · Lv.{levelFromXp(member.xp)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <input
          className="w-14 rounded-lg border border-white/10 bg-slate-950/50 px-1.5 py-1 text-[11px] text-slate-100"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          inputMode="numeric"
          aria-label={`จำนวนแต้ม XP ที่จะปรับให้ ${member.nickname}`}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void adjust(1)}
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-1 text-[11px] font-semibold text-emerald-300 disabled:opacity-50"
          title="เพิ่มแต้ม XP"
        >
          +
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void adjust(-1)}
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-1.5 py-1 text-[11px] font-semibold text-rose-300 disabled:opacity-50"
          title="ลดแต้ม XP"
        >
          −
        </button>
      </div>
      <div className="flex items-center gap-1">
        <input
          className="w-28 rounded-lg border border-white/10 bg-slate-950/50 px-1.5 py-1 text-[11px] text-slate-100"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={40}
          placeholder="ฉายา"
          aria-label={`ฉายาของ ${member.nickname}`}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void grantTitle()}
          className="rounded-lg border border-white/10 bg-white/[0.04] p-1 text-slate-300 disabled:opacity-50"
          title="บันทึกฉายา (เว้นว่าง = ถอดฉายา)"
        >
          <Icon name="check" className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
