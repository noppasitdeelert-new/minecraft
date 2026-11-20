"use client";

import { useEffect, useRef } from "react";

/**
 * Interval that only runs while the tab is visible.
 *
 * Every poll costs a Worker request (and a D1 read), so a tab left open in the
 * background would burn the daily quota for nothing. When the tab is hidden the
 * timer stops; when it comes back the task runs once immediately, so the page
 * is fresh again before the next tick.
 */
export function useVisiblePoll(task: () => void | Promise<void>, intervalMs: number, enabled = true): void {
  const latest = useRef(task);

  useEffect(() => {
    latest.current = task;
  }, [task]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      timer = setInterval(() => {
        if (!document.hidden) void latest.current();
      }, intervalMs);
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
        return;
      }
      void latest.current();
      start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, intervalMs]);
}
