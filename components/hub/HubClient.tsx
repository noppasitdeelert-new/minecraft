"use client";

import { useEffect, useState } from "react";
import { Icon } from "../icons";
import PollsPanel from "./PollsPanel";
import ResourcesPanel from "./ResourcesPanel";
import QaPanel from "./QaPanel";
import InventoryPanel from "./InventoryPanel";
import GalleryPanel from "./GalleryPanel";

const TABS = [
  { key: "polls", label: "โหวต", icon: "chart", desc: "1 บัญชี 1 เสียง" },
  { key: "resources", label: "ชีท/ไฟล์เรียน", icon: "file", desc: "ลิงก์สรุปและข้อสอบ" },
  { key: "qa", label: "ถาม-ตอบ", icon: "help", desc: "บอร์ดช่วยการบ้าน" },
  { key: "inventory", label: "ยืม-คืนของ", icon: "box", desc: "ของส่วนกลาง" },
  { key: "gallery", label: "แกลเลอรี", icon: "camera", desc: "รูปกิจกรรม" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function HubClient({ me, canManage }: { me: { id: number; role: string }; canManage: boolean }) {
  const [tab, setTab] = useState<TabKey>("polls");

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (TABS.some((t) => t.key === hash)) setTab(hash as TabKey);
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              window.history.replaceState(null, "", `#${t.key}`);
            }}
            className={`rounded-xl border px-3 py-2.5 text-left transition ${
              tab === t.key
                ? "border-indigo-400/40 bg-indigo-500/15 text-white"
                : "border-white/8 bg-white/[0.03] text-slate-300 hover:border-indigo-400/25"
            }`}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <Icon name={t.icon} className="size-4" />
              {t.label}
            </span>
            <span className="mt-0.5 block text-[10px] text-slate-500">{t.desc}</span>
          </button>
        ))}
      </div>

      <div className="animate-fade-up">
        {tab === "polls" ? <PollsPanel me={me} canManage={canManage} /> : null}
        {tab === "resources" ? <ResourcesPanel me={me} canManage={canManage} /> : null}
        {tab === "qa" ? <QaPanel me={me} canManage={canManage} /> : null}
        {tab === "inventory" ? <InventoryPanel me={me} canManage={canManage} /> : null}
        {tab === "gallery" ? <GalleryPanel me={me} canManage={canManage} /> : null}
      </div>
    </div>
  );
}
