"use client";

import { useState } from "react";
import type { MusicQueueEntry, MusicSong } from "@/lib/types";
import { useMusic } from "./MusicPlayerProvider";
import { Alert, Empty } from "./ui";
import { Icon } from "./icons";

function Cover({ src, size = 56 }: { src: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-xl object-cover ring-1 ring-white/10" style={{ width: size, height: size }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-xl bg-white/5 text-slate-500 ring-1 ring-white/10" style={{ width: size, height: size }}>
      <Icon name="music" className="size-5" />
    </span>
  );
}

function QueueRow({
  item,
  index,
  onRemove,
}: {
  item: MusicQueueEntry;
  index?: number;
  onRemove: (id: number) => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      {typeof index === "number" ? <span className="w-4 text-center text-[11px] text-slate-500">{index + 1}</span> : null}
      <Cover src={item.artwork_url} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-100">{item.title}</p>
        <p className="truncate text-[11px] text-slate-400">
          {item.artist}
          {item.added_by_nickname ? ` · เพิ่มโดย ${item.added_by_nickname}` : ""}
        </p>
      </div>
      {typeof index === "number" ? (
        <button onClick={() => onRemove(item.queue_id)} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-rose-300" title="นำออกจากคิว">
          <Icon name="close" className="size-4" />
        </button>
      ) : null}
    </li>
  );
}

export default function MusicClient() {
  const { data, error, needTap, playing, position, duration, toggle, skip, addToQueue, removeFromQueue } = useMusic();
  const [busySong, setBusySong] = useState<number | null>(null);

  if (!data) {
    return <div className="card p-10 text-center text-sm text-slate-400">กำลังโหลดเพลง...</div>;
  }

  async function enqueue(song: MusicSong) {
    setBusySong(song.id);
    try {
      await addToQueue(song.id);
    } catch {
      /* surfaced in the shared error alert */
    } finally {
      setBusySong(null);
    }
  }

  const current = data.current;
  const progress = duration ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="card overflow-hidden">
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="absolute inset-0 -z-0 bg-gradient-to-r from-indigo-500/10 via-transparent to-violet-500/5" />
          <Cover src={current?.artwork_url ?? null} size={96} />
          <div className="relative min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-wide text-indigo-300 uppercase">กำลังเล่นให้ทั้งห้องฟัง</p>
            {current ? (
              <>
                <h2 className="mt-1 truncate text-xl font-bold text-white">{current.title}</h2>
                <p className="truncate text-sm text-slate-400">{current.artist}</p>
              </>
            ) : (
              <>
                <h2 className="mt-1 text-xl font-bold text-white">ยังไม่มีเพลงในคิว</h2>
                <p className="text-sm text-slate-400">เลือกเพลงจากคลังด้านล่างเพื่อเริ่มเล่นให้ทุกคนฟังพร้อมกันทุกหน้า</p>
              </>
            )}

            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-400 transition-[width] duration-500 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-slate-500">
              <span>{current ? `${Math.floor(position)} วิ` : "0 วิ"}</span>
              <span>{duration ? Math.round(duration) : current?.duration_ms ? Math.round(current.duration_ms / 1000) : 0} วิ</span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={() => void toggle()} disabled={!current} className="btn btn-primary btn-sm">
                <Icon name={playing ? "pause" : "play"} className="size-4" />
                {playing ? "หยุดชั่วคราว" : "เล่น"}
              </button>
              <button onClick={() => void skip()} disabled={!current && data.queue.length === 0} className="btn btn-ghost btn-sm">
                ข้ามเพลง
              </button>
              <span className="text-[11px] text-slate-500">เสียงเล่นต่อเนื่องทุกหน้า (ยกเว้นห้องประชุม) ตามเวลากลางของเซิร์ฟเวอร์</span>
            </div>
            {needTap ? (
              <p className="mt-2 text-[11px] text-amber-300">เบราว์เซอร์บล็อกการเล่นอัตโนมัติ — กดปุ่ม “เล่น” หนึ่งครั้ง</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <header className="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon name="clock" className="size-4 text-indigo-300" /> คิวเพลง ({data.queue.length})
            </h3>
          </header>
          {data.queue.length === 0 ? (
            <div className="p-4">
              <Empty icon="music" title="คิวว่าง" hint="กด “เข้าคิว” จากคลังเพลงเพื่อให้ทุกคนฟังตามลำดับ" />
            </div>
          ) : (
            <ul className="divide-y divide-white/5 pb-2">
              {data.queue.map((item, i) => (
                <QueueRow
                  key={item.queue_id}
                  item={item}
                  index={i}
                  onRemove={(id) => {
                    void removeFromQueue(id).catch(() => undefined);
                  }}
                />
              ))}
            </ul>
          )}
          {data.history.length > 0 ? (
            <div className="border-t border-white/5 px-4 py-3">
              <p className="mb-1 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">เล่นล่าสุด</p>
              <ol className="space-y-1">
                {data.history.slice(0, 4).map((item) => (
                  <li key={item.queue_id} className="flex items-center gap-2 text-[11px] text-slate-500">
                    <Icon name="music" className="size-3" />
                    <span className="truncate">{item.title}</span>
                    <span className="truncate text-slate-600">· {item.artist}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>

        <section className="card overflow-hidden">
          <header className="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon name="music" className="size-4 text-indigo-300" /> คลังเพลงของห้อง ({data.songs.length})
            </h3>
            {data.canManage ? <span className="text-[10px] text-slate-500">เพิ่มเพลงได้ที่หน้าแอดมิน</span> : null}
          </header>
          {data.songs.length === 0 ? (
            <div className="p-4">
              <Empty icon="music" title="ยังไม่มีเพลงในคลัง" hint="แอดมินสามารถค้นหาและดาวน์โหลดเพลงเต็มได้จากหน้าจัดการระบบ" />
            </div>
          ) : (
            <ul className="divide-y divide-white/5 pb-2">
              {data.songs.map((song) => {
                const inQueue = song.queue_status !== null;
                return (
                  <li key={song.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Cover src={song.artwork_url} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-100">{song.title}</p>
                      <p className="truncate text-[11px] text-slate-400">
                        {song.artist}
                        {song.album ? ` · ${song.album}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => enqueue(song)}
                      disabled={inQueue || busySong === song.id}
                      className={`btn btn-sm ${inQueue ? "btn-ghost opacity-60" : "btn-primary"}`}
                    >
                      {inQueue ? (song.queue_status === "playing" ? "กำลังเล่น" : "อยู่ในคิว") : busySong === song.id ? "กำลังเพิ่ม..." : "เข้าคิว"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
