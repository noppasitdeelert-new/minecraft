"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

/** ปุ่มคัดลอกที่ใช้ได้ทั้ง clipboard API และ fallback สำหรับเบราว์เซอร์เก่า/ไม่ใช่ https */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* ตกลงไปใช้วิธีสำรอง */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export default function ShareKeys({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  if (codes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/12 px-3.5 py-6 text-center text-sm text-slate-400">
        ตอนนี้ยังไม่มีคีย์ที่ว่าง — แจ้งแอดมินให้สร้างคีย์ชุดใหม่
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">คีย์ที่ยังไม่ถูกใช้ · {codes.length} ใบ</p>
        <button
          type="button"
          onClick={async () => {
            const ok = await copyText(codes.join("\n"));
            if (ok) setCopied("all");
          }}
          className="btn btn-ghost btn-sm"
        >
          <Icon name="copy" className="size-3.5" />
          {copied === "all" ? "คัดลอกทั้งหมดแล้ว" : "คัดลอกทั้งหมด"}
        </button>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {codes.map((code) => (
          <li
            key={code}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2"
          >
            <code className="min-w-0 flex-1 truncate font-mono text-sm tracking-wide text-indigo-200">{code}</code>
            <button
              type="button"
              onClick={async () => {
                const ok = await copyText(code);
                if (ok) setCopied(code);
              }}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label={`คัดลอกคีย์ ${code}`}
              title="คัดลอก"
            >
              <Icon name={copied === code ? "check" : "copy"} className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
