"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/client";
import { GAMES, GAME_KEYS, type GameKey } from "@/lib/games";
import { useVisiblePoll } from "@/lib/use-visible-poll";
import { useGameLive } from "@/lib/use-game-live";
import { Alert, Avatar, Empty, RoleBadge, SectionCard } from "@/components/ui";
import { Icon } from "@/components/icons";

type LobbyRoom = {
  id: number;
  game: GameKey;
  gameName: string;
  hostNickname: string;
  hostRole: string;
  hostTitle: string | null;
  hostColor: string;
  hostLevel: number;
  turnSeconds: number;
  createdAt: string;
  isMine: boolean;
};

type ActiveRoom = {
  id: number;
  game: GameKey;
  gameName: string;
  mode: "pvp" | "bot";
  status: string;
  hostNickname: string;
  guestNickname: string | null;
  turnSeconds: number;
};

type LeaderRow = {
  user_id: number;
  nickname: string;
  avatar_color: string;
  title: string | null;
  level: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  rating: number;
  streak: number;
};

type StatRow = {
  game: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  rating: number;
  best_rating: number;
  streak: number;
};

type LobbyPayload = {
  rooms: LobbyRoom[];
  active: ActiveRoom[];
  leaderboards: Record<string, LeaderRow[]>;
  myStats: Record<string, StatRow>;
  xpToday: number;
  xpCap: number;
};

const STATUS_TEXT: Record<string, string> = {
  waiting: "รอคู่แข่ง",
  playing: "กำลังเล่น",
  finished: "จบแล้ว",
};

export default function GamesLobbyClient() {
  const router = useRouter();
  const [data, setData] = useState<LobbyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<GameKey>("checkers");
  const [mode, setMode] = useState<"pvp" | "bot">("pvp");
  const [turnSeconds, setTurnSeconds] = useState(60);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<GameKey>("checkers");

  const load = useCallback(async () => {
    try {
      const payload = await apiGet<LobbyPayload>("/api/games/rooms");
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดล็อบบี้ไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // มีห้องใหม่/มีคน join/ห้องจบ → ล็อบบี้อัปเดตทันที, ถ้าเรียลไทม์ใช้ไม่ได้ยัง poll สำรอง
  const live = useGameLive("games:lobby", () => void load());
  useVisiblePoll(load, live.status === "online" ? 30000 : 6000);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ id: number }>("/api/games/rooms", { game, mode, turnSeconds });
      router.push(`/games/${res.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างห้องไม่สำเร็จ");
      setBusy(false);
    }
  }

  async function join(id: number) {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/games/rooms/${id}/join`, {});
      router.push(`/games/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าร่วมห้องไม่สำเร็จ");
      setBusy(false);
      void load();
    }
  }

  const meta = GAMES[game];
  const leaderboard = data?.leaderboards?.[tab] ?? [];

  return (
    <div className="space-y-6">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <SectionCard title="สร้างห้องใหม่" icon="plus">
          <div className="grid grid-cols-2 gap-2">
            {GAME_KEYS.map((key) => {
              const item = GAMES[key];
              const selected = game === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setGame(key)}
                  className={`rounded-xl border p-3 text-left transition ${
                    selected
                      ? "border-indigo-400/60 bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/30"
                      : "border-white/10 bg-white/[0.02] hover:border-white/25"
                  }`}
                >
                  <span className="block text-sm font-semibold text-white">{item.name}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-400">{item.tagline}</span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-slate-400">{meta.description}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <span className="label">โหมดเล่น</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("pvp")}
                  className={`flex-1 rounded-xl border px-2 py-2 text-xs font-medium transition ${
                    mode === "pvp" ? "border-indigo-400/60 bg-indigo-500/20 text-white" : "border-white/10 text-slate-400"
                  }`}
                >
                  เล่นกับเพื่อน 1v1
                </button>
                <button
                  type="button"
                  onClick={() => setMode("bot")}
                  className={`flex-1 rounded-xl border px-2 py-2 text-xs font-medium transition ${
                    mode === "bot" ? "border-violet-400/60 bg-violet-500/20 text-white" : "border-white/10 text-slate-400"
                  }`}
                >
                  ซ้อมกับบอท AI
                </button>
              </div>
            </div>
            <label className="block">
              <span className="label">เวลาต่อตา</span>
              <select className="input" value={turnSeconds} onChange={(event) => setTurnSeconds(Number(event.target.value))}>
                {[30, 60, 120, 300].map((value) => (
                  <option key={value} value={value}>
                    {value} วินาที
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button type="button" onClick={create} disabled={busy} className="btn btn-primary mt-4 w-full">
            <Icon name="plus" className="size-4" />
            {mode === "bot" ? "เริ่มซ้อมกับบอทเลย" : "สร้างห้องรอคู่แข่ง"}
          </button>
          <p className="mt-2 text-[11px] text-slate-500">
            ไม่มีระบบเงินหรือการเดิมพัน — เล่นเพื่อความสนุก สถิติและแต้ม XP เท่านั้น
          </p>
        </SectionCard>

        <div className="space-y-5">
          <SectionCard title="ห้องที่ฉันเล่นอยู่" icon="play">
            {data === null ? (
              <p className="py-4 text-center text-xs text-slate-500">กำลังโหลด…</p>
            ) : data.active.length === 0 ? (
              <Empty icon="play" title="ยังไม่มีห้องที่เล่นอยู่" hint="สร้างห้องใหม่ด้านซ้าย หรือเข้าห้องของเพื่อนจากรายการ" />
            ) : (
              <div className="space-y-2">
                {data.active.map((room) => (
                  <Link
                    key={room.id}
                    href={`/games/${room.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 transition hover:border-indigo-400/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-white">
                        {room.gameName} <span className="text-[11px] text-slate-500">#{room.id}</span>
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {room.mode === "bot" ? "ซ้อมกับบอท" : `${room.hostNickname} พบ ${room.guestNickname ?? "รอคู่แข่ง"}`}
                      </span>
                    </span>
                    <span className="badge bg-indigo-500/15 text-indigo-200 ring-indigo-400/25">{STATUS_TEXT[room.status] ?? room.status}</span>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="สถิติของฉัน" icon="chart">
            <div className="space-y-1.5">
              {GAME_KEYS.map((key) => {
                const stat = data?.myStats?.[key];
                return (
                  <div key={key} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-2.5 py-2 text-xs">
                    <span className="text-slate-300">{GAMES[key].name}</span>
                    <span className="text-slate-400">
                      {stat ? `${stat.wins}W · ${stat.losses}L · ${stat.draws}D` : "—"}
                    </span>
                    <span className="font-semibold text-amber-300">{stat ? stat.rating : 1200}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
              <span>XP จากเกมวันนี้</span>
              <span>
                {data?.xpToday ?? 0} / {data?.xpCap ?? 150} XP
              </span>
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="ห้องที่เปิดรอคู่แข่ง" icon="users">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <span
            className={`size-1.5 rounded-full ${live.status === "online" ? "animate-pulse bg-emerald-400" : "bg-slate-500"}`}
          />
          {live.status === "online" ? "อัปเดตทันทีแบบเรียลไทม์" : "รีเฟรชอัตโนมัติทุก 6 วินาที"}
        </p>
        {data === null ? (
          <p className="py-4 text-center text-xs text-slate-500">กำลังโหลด…</p>
        ) : data.rooms.length === 0 ? (
          <Empty icon="users" title="ยังไม่มีห้องเปิดรอ" hint="กดสร้างห้องรอคู่แข่ง แล้วชวนเพื่อนเข้าห้องจากลิงก์ได้เลย" />
        ) : (
          <div className="space-y-2">
            {data.rooms.map((room) => (
              <div
                key={room.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5"
              >
                <Avatar name={room.hostNickname} color={room.hostColor} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-white">
                    {room.hostNickname}
                    <RoleBadge role={room.hostRole} />
                    {room.hostTitle ? <span className="badge bg-violet-500/10 text-violet-200 ring-violet-400/25">{room.hostTitle}</span> : null}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {room.gameName} · Lv.{room.hostLevel} · {room.turnSeconds} วินาที/ตา · ห้อง #{room.id}
                  </p>
                </div>
                {room.isMine ? (
                  <Link href={`/games/${room.id}`} className="btn btn-ghost btn-sm">
                    เปิดห้องของฉัน
                  </Link>
                ) : (
                  <button type="button" onClick={() => join(room.id)} disabled={busy} className="btn btn-primary btn-sm">
                    เข้าร่วมเล่น (Join)
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="ตารางอันดับแชมป์กระดาน" icon="trophy">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {GAME_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                tab === key ? "bg-indigo-500/20 text-indigo-100 ring-1 ring-inset ring-indigo-400/30" : "text-slate-400 hover:bg-white/5"
              }`}
            >
              {GAMES[key].name}
            </button>
          ))}
        </div>
        {leaderboard.length === 0 ? (
          <Empty icon="trophy" title="ยังไม่มีผู้เล่นในอันดับนี้" hint="เล่นจบ 1 เกมกับเพื่อนเพื่อเริ่มเก็บคะแนน Elo" />
        ) : (
          <div className="space-y-1.5">
            {leaderboard.map((row, index) => (
              <div key={row.user_id} className="flex items-center gap-3 rounded-xl bg-white/[0.02] px-3 py-2">
                <span className={`w-5 text-center text-sm font-bold ${index === 0 ? "text-amber-300" : "text-slate-500"}`}>
                  {index + 1}
                </span>
                <Avatar name={row.nickname} color={row.avatar_color} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">
                    {row.nickname} <span className="text-[11px] text-slate-500">Lv.{row.level}</span>
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {row.wins}W · {row.losses}L · {row.draws}D {row.streak >= 2 ? `· ชนะติด ${row.streak}` : ""}
                  </p>
                </div>
                <span className="text-sm font-bold text-amber-300">{row.rating}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
