"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

type Feed = {
  announcements: Array<{ id: number; title: string; created_at: string }>;
  songs: Array<{ id: number; title: string; artist: string; created_at: string }>;
};

const LAST_KEY = "skc105_notify_last_announcement";
const ASKED_KEY = "skc105_notify_asked";

/**
 * Asks the visitor for permission to show browser notifications, then polls a
 * small feed so new announcements (and songs) appear as desktop notifications.
 */
export default function NotificationPrompt() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [hidden, setHidden] = useState(true);
  const lastId = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    setHidden(localStorage.getItem(ASKED_KEY) === "dismissed" || Notification.permission !== "default");
    const stored = Number(localStorage.getItem(LAST_KEY) || 0);
    lastId.current = Number.isFinite(stored) && stored > 0 ? stored : null;
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const feed = (await res.json()) as Feed;
        if (cancelled) return;
        const newest = feed.announcements[0];
        if (!newest) return;
        if (lastId.current === null) {
          lastId.current = newest.id;
          localStorage.setItem(LAST_KEY, String(newest.id));
          return;
        }
        if (newest.id > lastId.current) {
          new Notification("ประกาศใหม่จาก SKC105", {
            body: newest.title,
            icon: "/icon.svg",
            tag: `skc-announcement-${newest.id}`,
          });
          lastId.current = newest.id;
          localStorage.setItem(LAST_KEY, String(newest.id));
        }
      } catch {
        /* offline — try again on the next tick */
      }
    }

    void poll();
    const timer = setInterval(poll, 45000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [permission]);

  async function enable() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    localStorage.setItem(ASKED_KEY, result === "granted" ? "granted" : "dismissed");
    setHidden(true);
    if (result === "granted") {
      new Notification("SKC105 Room Hub", { body: "เปิดการแจ้งเตือนแล้ว — จะแจ้งเมื่อมีประกาศใหม่", icon: "/icon.svg" });
    }
  }

  function dismiss() {
    localStorage.setItem(ASKED_KEY, "dismissed");
    setHidden(true);
  }

  if (permission !== "default" || hidden) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-400/25 bg-indigo-500/[0.08] px-4 py-3">
      <span className="rounded-xl bg-indigo-500/15 p-2 text-indigo-300">
        <Icon name="bell" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white">เปิดการแจ้งเตือนของห้อง?</p>
        <p className="text-xs text-slate-400">ให้เว็บแจ้งเตือนเมื่อมีประกาศใหม่หรือเพลงใหม่เข้าคิว (ปิดได้ทุกเมื่อในเบราว์เซอร์)</p>
      </div>
      <div className="flex gap-2">
        <button onClick={enable} className="btn btn-primary btn-sm">
          อนุญาตการแจ้งเตือน
        </button>
        <button onClick={dismiss} className="btn btn-ghost btn-sm">
          ไม่ใช่ตอนนี้
        </button>
      </div>
    </div>
  );
}
