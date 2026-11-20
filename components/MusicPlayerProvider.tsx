"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/client";
import { useVisiblePoll } from "@/lib/use-visible-poll";
import type { MusicSong, MusicState } from "@/lib/types";
import { Icon } from "./icons";

type Payload = MusicState & { songs: MusicSong[]; canManage: boolean };

type MusicContextValue = {
  data: Payload | null;
  error: string | null;
  needTap: boolean;
  playing: boolean;
  position: number;
  duration: number;
  toggle: () => Promise<void>;
  skip: () => Promise<void>;
  addToQueue: (songId: number) => Promise<void>;
  removeFromQueue: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
};

const MusicContext = createContext<MusicContextValue | null>(null);

export function useMusic(): MusicContextValue {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error("useMusic must be used inside MusicPlayerProvider");
  return ctx;
}

export default function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needTap, setNeedTap] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingSeek = useRef(0);
  const currentId = useRef<number | null>(null);
  const reported = useRef<Set<number>>(new Set());

  const onMeeting = pathname.startsWith("/meeting");
  const onMusicPage = pathname === "/music";

  const refresh = useCallback(async () => {
    try {
      const res = await apiGet<Payload>("/api/music");
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลเพลงไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 20s keeps the room in sync (the play position is derived from started_at and
  // the song changes instantly for whoever presses skip) without a request every
  // few seconds. Hidden tabs stop polling and refresh once when they return.
  useVisiblePoll(refresh, 20000);

  // Pause inside a meeting room and resume when coming back out.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (onMeeting) {
      audio.pause();
      return;
    }
    if (audio.src && audio.paused) {
      void audio.play().then(() => setNeedTap(false)).catch(() => undefined);
    }
  }, [onMeeting]);

  const current = data?.current ?? null;

  // Switch tracks and seek to the room's shared position.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!current) {
      currentId.current = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setPlaying(false);
      setPosition(0);
      setDuration(0);
      return;
    }
    if (currentId.current === current.queue_id && audio.src.includes(`/api/music/${current.song_id}/audio`)) return;

    currentId.current = current.queue_id;
    const expected = Math.max(0, (Date.now() - new Date(current.started_at).getTime()) / 1000);
    pendingSeek.current = expected;
    audio.src = `/api/music/${current.song_id}/audio`;
    audio.load();
    if (onMeeting) return;
    void audio.play().then(() => setNeedTap(false)).catch(() => setNeedTap(true));
  }, [current?.queue_id, current?.song_id, current?.started_at, onMeeting]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (onMeeting) return;
    if (audio.paused) await audio.play().catch(() => setNeedTap(true));
    else audio.pause();
  }

  async function skip() {
    try {
      const res = await apiPost<MusicState>("/api/music/next");
      setData((prev) => (prev ? { ...prev, ...res } : prev));
      setNeedTap(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ข้ามเพลงไม่สำเร็จ");
    }
  }

  async function addToQueue(songId: number) {
    try {
      await apiPost("/api/music/queue", { song_id: songId });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มเข้าคิวไม่สำเร็จ");
      throw err;
    }
  }

  async function removeFromQueue(id: number) {
    try {
      await apiDelete(`/api/music/queue?id=${id}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "นำออกจากคิวไม่สำเร็จ");
      throw err;
    }
  }

  const showBar = Boolean(current) && !onMeeting && !onMusicPage;

  return (
    <MusicContext.Provider
      value={{ data, error, needTap, playing, position, duration, toggle, skip, addToQueue, removeFromQueue, refresh }}
    >
      {children}

      <audio
        ref={audioRef}
        className="hidden"
        preload="auto"
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (!audio) return;
          audio.currentTime = pendingSeek.current;
          const seconds = Number.isFinite(audio.duration) ? audio.duration : 0;
          setDuration(seconds);
          if (current && seconds > 3 && !reported.current.has(current.song_id)) {
            reported.current.add(current.song_id);
            const known = current.duration_ms ? current.duration_ms / 1000 : 0;
            if (Math.abs(known - seconds) > 2) {
              void apiPost(`/api/music/${current.song_id}/duration`, { duration_ms: Math.round(seconds * 1000) }).catch(
                () => undefined,
              );
            }
          }
        }}
        onTimeUpdate={() => setPosition(audioRef.current?.currentTime ?? 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          void skip();
        }}
      />

      {showBar && current ? (
        <div className="fixed inset-x-3 bottom-3 z-30 pb-[env(safe-area-inset-bottom)] lg:inset-x-auto lg:right-6 lg:bottom-5 lg:left-[17.5rem]">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b1224]/95 px-3 py-2.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
            {current.artwork_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.artwork_url} alt="" className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-white/10" />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-500 ring-1 ring-white/10">
                <Icon name="music" className="size-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className="truncate text-xs font-semibold text-white">{current.title}</p>
                <p className="hidden truncate text-[11px] text-slate-400 sm:block">{current.artist}</p>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-400"
                    style={{ width: `${duration ? Math.min(100, (position / duration) * 100) : 0}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500">
                  {Math.floor(position)}/{duration ? Math.floor(duration) : Math.round((current.duration_ms ?? 0) / 1000)} วิ
                </span>
              </div>
            </div>
            <button onClick={toggle} className="rounded-full bg-indigo-500 p-2 text-white transition hover:bg-indigo-400" title={playing ? "หยุดชั่วคราว" : "เล่น"}>
              <Icon name={playing ? "pause" : "play"} className="size-4" />
            </button>
            <button onClick={() => void skip()} className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white" title="ข้ามเพลง">
              <Icon name="close" className="size-4" />
            </button>
            <Link href="/music" className="hidden rounded-lg px-2 py-1 text-[11px] font-medium text-indigo-300 hover:text-indigo-200 sm:block">
              คิวเพลง
            </Link>
          </div>
          {needTap ? (
            <p className="mt-1 text-right text-[10px] text-amber-300">กดปุ่มเล่นหนึ่งครั้งเพื่อให้เบราว์เซอร์อนุญาตเสียง</p>
          ) : null}
        </div>
      ) : null}
    </MusicContext.Provider>
  );
}
