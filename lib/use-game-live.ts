"use client";

import { useEffect, useRef, useState } from "react";

/**
 * WebSocket เรียลไทม์ของโซนเกม (Freebuff Sites realtime)
 *
 * - ต่อได้เมื่อผู้ใช้ล็อกอิน: ขอตั๋วที่ /api/realtime/ticket แล้วเปิด socket
 * - ทุก event จากเซิร์ฟเวอร์ → เรียก onEvent() เพื่อดึง snapshot ที่เชื่อถือได้
 * - ตั๋วหมดอายุทุก 5 นาที → ต่อใหม่เองอัตโนมัติ
 * - ถ้าระบบเรียลไทม์ยังไม่เปิด (503) จะคืน status="disabled" ให้หน้าเว็บ
 *   กลับไปใช้ polling แทนได้ตามปกติ
 */

export type LiveStatus = "connecting" | "online" | "offline" | "disabled";

type Ticket = { ticket: string; expiresAt: number; websocketUrl: string };
type Member = { connectionId: string; userId: string };
type ServerMessage =
  | { type: "ready"; userId: string; expiresInMs: number }
  | { type: "presence"; members: Member[] }
  | { type: "presence_update"; member: Member }
  | { type: "broadcast"; event: string; data: unknown };

export function useGameLive(
  room: string,
  onEvent: () => void,
  enabled = true,
): { status: LiveStatus; viewers: number; presentIds: string[] } {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [viewers, setViewers] = useState(0);
  // userId ของคนอื่นที่กำลังต่ออยู่ในห้อง (ข้อมูล presence สด ๆ ไม่ต้องรอ snapshot)
  const [presentIds, setPresentIds] = useState<string[]>([]);
  const handler = useRef(onEvent);

  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let renewTimer: ReturnType<typeof setTimeout> | null = null;
    let retry = 0;
    const members = new Map<string, Member>();
    let selfId: string | null = null;

    const clearTimers = () => {
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (renewTimer !== null) clearTimeout(renewTimer);
      retryTimer = null;
      renewTimer = null;
    };

    const refreshViewers = () => {
      // นับคน (ไม่ใช่แท็บ) — ผู้ใช้คนเดียวเปิดหลายแท็บก็นับครั้งเดียว
      const ids = new Set<string>();
      for (const member of members.values()) if (member.userId !== selfId) ids.add(member.userId);
      setPresentIds([...ids]);
      setViewers(ids.size);
    };

    const schedule = () => {
      if (stopped || retryTimer !== null) return;
      const delay = Math.min(10_000, 600 * 2 ** Math.min(retry, 4)) * (0.75 + Math.random() * 0.5);
      retry += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect();
      }, delay);
    };

    const drop = (target: WebSocket | null) => {
      if (!target) return;
      target.onmessage = null;
      target.onclose = null;
      target.onerror = null;
      if (socket === target) socket = null;
      try {
        target.close(1000, "renew");
      } catch {
        /* already closed */
      }
    };

    async function connect(): Promise<void> {
      if (stopped) return;
      setStatus("connecting");
      let ticket: Ticket;
      try {
        const res = await fetch("/api/realtime/ticket", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room }),
          cache: "no-store",
          credentials: "same-origin",
        });
        if (stopped) return;
        // ยังไม่เปิดระบบเรียลไทม์ หรือห้องไม่มีจริง → หยุด แล้วให้ polling ทำงานแทน
        if (res.status === 503 || res.status === 404 || res.status === 400) {
          setStatus("disabled");
          return;
        }
        if (res.status === 401 || res.status === 403) {
          setStatus("offline");
          retry = 0;
          schedule();
          return;
        }
        if (!res.ok) throw new Error(`ticket ${res.status}`);
        ticket = (await res.json()) as Ticket;
      } catch {
        if (stopped) return;
        setStatus("offline");
        schedule();
        return;
      }
      if (stopped) return;

      let next: WebSocket;
      try {
        next = new WebSocket(ticket.websocketUrl);
      } catch {
        setStatus("offline");
        schedule();
        return;
      }
      socket = next;

      next.onmessage = (event: MessageEvent) => {
        if (stopped || socket !== next) return;
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        if (message.type === "ready") {
          retry = 0;
          selfId = message.userId;
          members.clear();
          setPresentIds([]);
          setViewers(0);
          setStatus("online");
          if (renewTimer !== null) clearTimeout(renewTimer);
          const ttl = Number.isFinite(message.expiresInMs)
            ? Math.max(5_000, Math.min(300_000, message.expiresInMs))
            : 300_000;
          renewTimer = setTimeout(() => {
            renewTimer = null;
            if (stopped) return;
            drop(next);
            void connect();
          }, Math.max(1_000, ttl - 1_500));
          return;
        }
        if (message.type === "presence") {
          members.clear();
          for (const member of message.members) members.set(member.connectionId, member);
          refreshViewers();
          return;
        }
        if (message.type === "presence_update") {
          members.set(message.member.connectionId, message.member);
          refreshViewers();
          return;
        }
        if (message.type === "broadcast") handler.current();
      };

      next.onclose = () => {
        if (stopped || socket !== next) return;
        socket = null;
        setStatus("offline");
        schedule();
      };
      next.onerror = () => {
        if (stopped || socket !== next) return;
        drop(next);
        setStatus("offline");
        schedule();
      };
    }

    void connect();

    return () => {
      stopped = true;
      clearTimers();
      drop(socket);
      setViewers(0);
      setPresentIds([]);
    };
  }, [room, enabled]);

  return { status, viewers, presentIds };
}
