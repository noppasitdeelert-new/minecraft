"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/client";
import { useVisiblePoll } from "@/lib/use-visible-poll";
import { useGameLive } from "@/lib/use-game-live";
import { GAMES, type AnyMove, type GameKey, type Seat } from "@/lib/games";
import { Alert, Avatar, RoleBadge } from "@/components/ui";
import { Icon } from "@/components/icons";
import Board from "./Board";

type PlayerView = {
  id: number | null;
  nickname: string;
  role: string;
  title: string | null;
  avatarColor: string;
  avatarUrl: string | null;
  level: number;
  isBot: boolean;
  rating: number | null;
  wins: number;
  losses: number;
  draws: number;
};

type RoomState = {
  id: number;
  game: GameKey;
  gameName: string;
  mode: "pvp" | "bot";
  status: "waiting" | "playing" | "finished";
  turnSeconds: number;
  deadlineAt: string | null;
  turnSeat: Seat;
  winnerSeat: Seat | null;
  result: string | null;
  resultNote: string | null;
  moveCount: number;
  drawOfferSeat: number | null;
  check: boolean;
  cells: string[];
  legal: AnyMove[];
  lastMove: AnyMove | null;
  mySeat: Seat | null;
  isSpectator: boolean;
  canMove: boolean;
  players: [PlayerView, PlayerView];
  spectators: string[];
  moves: Array<{ id: number; seat: number; ply: number; notation: string | null; created_at: string }>;
  messages: Array<{ id: number; user_id: number; nickname: string; body: string; created_at: string }>;
  serverTime: string;
};

function clock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function outcomeLabel(view: RoomState, seat: Seat | null): { tone: string; text: string } {
  if (view.result === "draw") return { tone: "text-sky-200", text: "เกมนี้เสมอ" };
  if (view.winnerSeat === null) return { tone: "text-slate-200", text: "จบเกม" };
  const winner = view.players[view.winnerSeat]?.nickname ?? "ผู้เล่น";
  const reason =
    view.result === "timeout" ? "ชนะเพราะหมดเวลา" : view.result === "resign" ? "ชนะเพราะอีกฝ่ายยอมแพ้" : "ชนะ";
  if (seat === null) return { tone: "text-amber-200", text: `${winner} ${reason}` };
  return seat === view.winnerSeat
    ? { tone: "text-emerald-300", text: `คุณชนะ! (${reason})` }
    : { tone: "text-rose-300", text: `คุณแพ้ — ${winner} ${reason}` };
}

export default function GameRoomClient({ roomId }: { roomId: number }) {
  const router = useRouter();
  const [view, setView] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [chat, setChat] = useState("");
  const [tick, setTick] = useState(Date.now());
  const [closed, setClosed] = useState(false);
  const [clockSkew, setClockSkew] = useState(0);
  const pendingRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    if (pendingRef.current) return;
    try {
      const next = await apiGet<RoomState>(`/api/games/rooms/${roomId}`);
      setView(next);
      // นาฬิกาเดินตามเวลาของเซิร์ฟเวอร์ ไม่ใช่เวลาของเครื่องผู้เล่น → ทุกคนเห็นเวลาเหลือเท่ากัน
      const skew = Date.parse(next.serverTime) - Date.now();
      setClockSkew((prev) => (Math.abs(prev - skew) > 750 ? skew : prev));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดห้องไม่สำเร็จ");
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  // เรียลไทม์: เดินหมาก/จบเกม/แชต ถึงอีกฝั่งทันที ไม่ต้องรอรอบ polling
  const live = useGameLive(`game:${roomId}`, () => void load(), !closed);
  useVisiblePoll(load, live.status === "online" ? 15000 : 1200, !closed);

  // หมดเวลาเดินหมาก: ดึงผลจากเซิร์ฟเวอร์ทันทีที่เวลาของฝั่งเราหมด (ไม่รอรอบ polling)
  const deadlineMs = view?.deadlineAt && view.status === "playing" ? Date.parse(view.deadlineAt) : null;
  const expiredRef = useRef(false);
  useEffect(() => {
    if (deadlineMs === null) {
      expiredRef.current = false;
      return;
    }
    if (expiredRef.current || tick + clockSkew < deadlineMs) return;
    expiredRef.current = true;
    void load();
  }, [deadlineMs, tick, clockSkew, load]);

  async function sendMove(move: AnyMove) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const next = await apiPost<RoomState>(`/api/games/rooms/${roomId}/move`, { move });
      setView(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เดินหมากไม่สำเร็จ");
      void load();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function act(action: "resign" | "offer-draw" | "accept-draw" | "decline-draw" | "leave") {
    if (action === "resign" && !window.confirm("ยืนยันการยอมแพ้ในเกมนี้?")) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await apiPost<{ closed?: boolean; view?: RoomState }>(`/api/games/rooms/${roomId}/action`, { action });
      if (res.closed) {
        setClosed(true);
        router.push("/games");
        return;
      }
      if (res.view) setView(res.view);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function sendChat() {
    const text = chat.trim();
    if (!text) return;
    setChat("");
    try {
      await apiPost(`/api/games/rooms/${roomId}/chat`, { body: text });
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งข้อความไม่สำเร็จ");
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/games/${roomId}`);
      setNotice("คัดลอกลิงก์เชิญเพื่อนแล้ว");
      setTimeout(() => setNotice(null), 2500);
    } catch {
      setNotice(`ลิงก์เชิญ: /games/${roomId}`);
    }
  }

  if (!view) {
    return (
      <div className="space-y-3">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="card p-10 text-center text-sm text-slate-400">กำลังโหลดกระดาน…</div>
      </div>
    );
  }

  const meta = GAMES[view.game];
  const mySeat = view.mySeat;
  // จำนวนคนดูสด ๆ จาก presence (ตัดผู้เล่นทั้งสองฝั่งออก) — ไม่ต้องรอ snapshot รอบถัดไป
  const playerIds = new Set(
    view.players.map((player) => (player.id === null ? null : String(player.id))).filter((id): id is string => id !== null),
  );
  const liveSpectators =
    live.status === "online" ? live.presentIds.filter((id) => !playerIds.has(id)).length : null;
  const spectatorCount = liveSpectators ?? view.spectators.length;
  const remaining = deadlineMs !== null ? Math.max(0, (deadlineMs - (tick + clockSkew)) / 1000) : null;
  const offerFromOther = view.drawOfferSeat !== null && view.drawOfferSeat !== mySeat;
  const offerMine = view.drawOfferSeat !== null && view.drawOfferSeat === mySeat;
  const outcome = view.status === "finished" ? outcomeLabel(view, mySeat) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href="/games" className="btn btn-ghost btn-sm">
            <Icon name="menu" className="size-4" /> ล็อบบี้
          </Link>
          <div>
            <p className="text-sm font-semibold text-white">
              {view.gameName} <span className="text-[11px] font-normal text-slate-500">ห้อง #{view.id}</span>
            </p>
            <p className="text-[11px] text-slate-500">
              {view.mode === "bot" ? "ซ้อมกับบอท AI" : "เล่นกับเพื่อน 1v1"} · {view.turnSeconds} วินาที/ตา · ตาที่ {view.moveCount + 1}
              {view.isSpectator ? " · โหมดคนดู (Spectate)" : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`badge ${
              view.status === "playing"
                ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
                : view.status === "waiting"
                  ? "bg-amber-500/15 text-amber-300 ring-amber-400/30"
                  : "bg-slate-500/15 text-slate-300 ring-slate-400/30"
            }`}
          >
            {view.status === "playing" ? "กำลังเล่น" : view.status === "waiting" ? "รอคู่แข่ง" : "จบเกม"}
          </span>
          <span
            className={`badge flex items-center gap-1.5 ${
              live.status === "online"
                ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
                : "bg-slate-500/15 text-slate-300 ring-slate-400/25"
            }`}
            title={
              live.status === "online"
                ? "ผลการเดินและผลเกมส่งถึงทุกคนทันที"
                : "กำลังเชื่อมต่อเรียลไทม์ — ระหว่างนี้ระบบรีเฟรชอัตโนมัติแทน"
            }
          >
            <span
              className={`size-1.5 rounded-full ${live.status === "online" ? "animate-pulse bg-emerald-400" : "bg-slate-400"}`}
            />
            {live.status === "online" ? "เรียลไทม์" : live.status === "connecting" ? "กำลังเชื่อมต่อ" : "โหมดสำรอง"}
            {live.viewers > 0 ? <span className="text-[10px] text-slate-400">· ดูอยู่ {live.viewers}</span> : null}
          </span>
          <button type="button" onClick={copyInvite} className="btn btn-ghost btn-sm">
            <Icon name="link" className="size-4" /> ชวนเพื่อน
          </button>
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}

      {outcome ? (
        <div className="card border-white/15 bg-gradient-to-r from-indigo-500/10 to-violet-500/10 p-4">
          <p className={`text-lg font-bold ${outcome.tone}`}>{outcome.text}</p>
          <p className="mt-1 text-xs text-slate-400">{view.resultNote || "จบเกมแล้ว"}</p>
          <div className="mt-3 flex gap-2">
            <Link href="/games" className="btn btn-primary btn-sm">
              กลับล็อบบี้
            </Link>
            <button type="button" onClick={() => void load()} className="btn btn-ghost btn-sm">
              ดูผลล่าสุด
            </button>
          </div>
        </div>
      ) : null}

      {view.status === "waiting" ? (
        <div className="card p-5 text-center">
          <p className="text-sm font-semibold text-white">รอผู้ท้าชิงเข้าร่วม…</p>
          <p className="mt-1 text-xs text-slate-400">
            บอกเพื่อนให้เข้าล็อบบี้ <span className="text-indigo-300">/games</span> แล้วกด “เข้าร่วมเล่น” หรือส่งลิงก์เชิญ
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={copyInvite} className="btn btn-ghost btn-sm">
              <Icon name="copy" className="size-4" /> คัดลอกลิงก์เชิญ
            </button>
            <button type="button" onClick={() => act("leave")} className="btn btn-danger btn-sm">
              ยกเลิกห้อง
            </button>
          </div>
        </div>
      ) : null}

      {offerFromOther && view.status === "playing" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-2.5 text-sm text-sky-100">
          <span>อีกฝ่ายขอเสมอ</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => act("accept-draw")} disabled={pending} className="btn btn-primary btn-sm">
              ตกลงเสมอ
            </button>
            <button type="button" onClick={() => act("decline-draw")} disabled={pending} className="btn btn-ghost btn-sm">
              ไม่ตกลง
            </button>
          </span>
        </div>
      ) : null}
      {offerMine ? <Alert tone="info">ส่งคำขอเสมอแล้ว — รออีกฝ่ายตอบ</Alert> : null}
      {view.check && view.status === "playing" ? <Alert tone="error">รุก (Check)! ต้องแก้การรุกก่อน</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((seatIndex) => {
              const seat = seatIndex as Seat;
              const player = view.players[seat];
              const active = view.status === "playing" && view.turnSeat === seat;
              const isMe = mySeat === seat;
              return (
                <div
                  key={seat}
                  className={`rounded-xl border px-3 py-2.5 transition ${
                    active ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full ring-1 ring-white/30"
                      style={{ backgroundColor: meta.seatColors[seat] }}
                      aria-hidden="true"
                    />
                    <Avatar name={player.nickname} color={player.avatarColor} imageUrl={player.avatarUrl} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-white">
                        {player.nickname}
                        {isMe ? <span className="text-[10px] text-indigo-300">(คุณ)</span> : null}
                        {player.isBot ? <span className="text-[10px] text-violet-300">BOT</span> : null}
                      </p>
                      <p className="truncate text-[10px] text-slate-500">
                        {meta.seats[seat]}
                        {player.isBot ? "" : ` · Lv.${player.level}`}
                        {player.rating ? ` · ${player.rating}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono text-sm font-bold ${active ? "text-emerald-300" : "text-slate-400"}`}>
                        {active && remaining !== null ? clock(remaining) : clock(view.turnSeconds)}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {player.wins}W·{player.losses}L·{player.draws}D
                      </p>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <RoleBadge role={player.role} />
                    {player.title ? (
                      <span className="badge bg-violet-500/10 text-violet-200 ring-violet-400/25">{player.title}</span>
                    ) : null}
                    {active ? <span className="ml-auto text-[10px] text-emerald-300">ถึงตา</span> : null}
                  </div>
                  {active && remaining !== null ? (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full ${remaining <= 10 ? "bg-rose-400" : "bg-emerald-400"}`}
                        style={{ width: `${Math.min(100, Math.max(0, (remaining / view.turnSeconds) * 100))}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="card p-2 sm:p-3">
            <Board
              game={view.game}
              cells={view.cells}
              legal={view.legal}
              mySeat={mySeat}
              canMove={view.canMove && !pending}
              turnSeat={view.turnSeat}
              check={view.check}
              lastMove={view.lastMove}
              onMove={sendMove}
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-[11px] text-slate-500">
                {view.isSpectator
                  ? "คุณกำลังดูในโหมดคนดู — ไม่สามารถเดินหมากได้"
                  : view.status === "finished"
                    ? "เกมจบแล้ว"
                    : view.canMove
                      ? "ถึงตาคุณ — แตะหมากแล้วเลือกช่องที่ไฮไลต์"
                      : "รออีกฝ่ายเดินหมาก…"}
              </p>
              <span className="text-[11px] text-slate-500">รวม {view.moveCount} ตา</span>
            </div>
          </div>

          {mySeat !== null && view.status === "playing" ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => act("resign")} disabled={pending} className="btn btn-danger btn-sm">
                <Icon name="close" className="size-4" /> ยอมแพ้ (Resign)
              </button>
              {view.mode === "pvp" ? (
                <button
                  type="button"
                  onClick={() => act("offer-draw")}
                  disabled={pending || view.drawOfferSeat !== null}
                  className="btn btn-ghost btn-sm"
                >
                  <Icon name="hand" className="size-4" /> ขอเสมอ (Offer Draw)
                </button>
              ) : null}
              <button type="button" onClick={() => act("leave")} disabled={pending} className="btn btn-ghost btn-sm">
                <Icon name="logout" className="size-4" /> ออกจากห้อง
              </button>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="card flex h-[320px] flex-col">
            <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
              <p className="text-xs font-semibold text-white">แชตในโต๊ะ</p>
              <span
                className="text-[10px] text-slate-500"
                title={liveSpectators !== null ? "จำนวนคนดูจากการเชื่อมต่อเรียลไทม์" : "จำนวนคนดูจากข้อมูลห้องล่าสุด"}
              >
                {spectatorCount} คนดู
              </span>
            </div>
            <div className="chat-scroll flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
              {view.messages.length === 0 ? (
                <p className="py-6 text-center text-[11px] text-slate-500">ยังไม่มีข้อความ — ทักทายเพื่อนได้เลย</p>
              ) : (
                view.messages.map((message) => (
                  <p key={message.id} className="text-xs leading-relaxed">
                    <span className="font-medium text-indigo-300">{message.nickname}</span>{" "}
                    <span className="text-slate-300">{message.body}</span>
                  </p>
                ))
              )}
            </div>
            <div className="flex gap-1.5 border-t border-white/8 p-2">
              <input
                value={chat}
                onChange={(event) => setChat(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void sendChat();
                }}
                maxLength={200}
                placeholder="พิมพ์ข้อความสั้น ๆ…"
                className="input flex-1 text-xs"
              />
              <button type="button" onClick={sendChat} className="btn btn-primary btn-sm" aria-label="ส่งข้อความ">
                <Icon name="send" className="size-4" />
              </button>
            </div>
          </div>

          <div className="card p-3">
            <p className="mb-2 text-xs font-semibold text-white">ประวัติการเดิน</p>
            {view.moves.length === 0 ? (
              <p className="py-2 text-[11px] text-slate-500">ยังไม่มีการเดินหมาก</p>
            ) : (
              <div className="chat-scroll max-h-40 space-y-1 overflow-y-auto">
                {view.moves.slice(-16).map((move) => (
                  <div key={move.id} className="flex items-center gap-2 text-[11px]">
                    <span className="w-7 text-slate-500">#{move.ply}</span>
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.seatColors[move.seat === 0 ? 0 : 1] }} />
                    <span className="text-slate-300">{view.players[move.seat === 0 ? 0 : 1]?.nickname ?? "—"}</span>
                    <span className="font-mono text-slate-400">{move.notation}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {view.spectators.length > 0 ? (
            <div className="card p-3">
              <p className="mb-1.5 text-xs font-semibold text-white">คนดูในห้อง</p>
              <p className="text-[11px] text-slate-400">{view.spectators.join(", ")}</p>
            </div>
          ) : null}

          <div className="card p-3">
            <p className="mb-1.5 text-xs font-semibold text-white">กติกาเกมนี้</p>
            <ul className="space-y-1 text-[11px] text-slate-400">
              {meta.rules.map((rule) => (
                <li key={rule} className="flex gap-1.5">
                  <span className="text-indigo-400">·</span>
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
