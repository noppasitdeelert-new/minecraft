"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/client";
import { levelFromXp } from "@/lib/levels";
import type { LeaderboardEntry } from "@/lib/types";
import { Alert, Avatar, Empty, LevelBadge, RoleBadge, TitleBadge } from "../ui";
import { Icon } from "../icons";

type Payload = { members: LeaderboardEntry[]; me: { id: number; xp: number; rank: number } };

export default function LeaderboardPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<Payload>("/api/leaderboard");
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดอันดับไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) {
    return (
      <div className="card space-y-2 p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }

  if (data.members.length === 0) {
    return <Empty icon="trophy" title="ยังไม่มีสมาชิกในกระดานอันดับ" hint="สะสม XP จากการเช็กชื่อ ทำการบ้าน และแชร์ชีท" />;
  }

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-slate-400">อันดับของฉัน</p>
          <p className="mt-0.5 text-lg font-bold text-white">
            #{data.me.rank} <span className="text-sm font-medium text-slate-400">· {data.me.xp} XP · Lv.{levelFromXp(data.me.xp)}</span>
          </p>
        </div>
        <span className="rounded-xl bg-amber-500/10 p-2.5 text-amber-300 ring-1 ring-inset ring-amber-400/25">
          <Icon name="trophy" />
        </span>
      </div>

      <ol className="card divide-y divide-white/8 overflow-hidden">
        {data.members.map((member, index) => {
          const level = levelFromXp(member.xp);
          const isMe = member.id === data.me.id;
          return (
            <li
              key={member.id}
              className={`flex items-center gap-3 px-4 py-3 ${isMe ? "bg-indigo-500/10" : ""}`}
            >
              <span
                className={`w-7 shrink-0 text-center font-mono text-sm font-bold ${
                  index === 0 ? "text-amber-300" : index === 1 ? "text-slate-200" : index === 2 ? "text-orange-300" : "text-slate-500"
                }`}
              >
                {index + 1}
              </span>
              <Avatar name={member.nickname} color={member.avatar_color} imageUrl={member.avatar_url} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-white">{member.nickname}</span>
                  <RoleBadge role={member.role} className="!px-1.5 !py-0 !text-[9px]" />
                  <LevelBadge level={level} className="!px-1.5 !py-0 !text-[9px]" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <TitleBadge title={member.title} className="!px-1.5 !py-0 !text-[9px]" />
                  <span className="text-[11px] text-slate-500">{member.message_count} ข้อความ</span>
                </div>
              </div>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-sm font-semibold text-indigo-200">{member.xp}</span>
                <span className="block text-[10px] text-slate-500">XP</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="px-1 text-[11px] text-slate-500">เรียงตามแต้ม XP · ได้ XP จากการเช็กชื่อ ทำการบ้านตรงเวลา แชร์ชีท และร่วมโหวต</p>
    </div>
  );
}
