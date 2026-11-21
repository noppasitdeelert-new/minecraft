"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost } from "@/lib/client";
import { relativeTime } from "@/lib/format";
import { Alert, Avatar, Empty, SectionCard } from "../ui";
import { Icon } from "../icons";

type Reward = {
  id: number;
  name: string;
  description: string | null;
  cost: number;
  stock: number | null;
  active: number;
  created_at: string;
  redeemed: number;
};

type Redemption = {
  id: number;
  reward_id: number;
  name: string;
  cost: number;
  status: string;
  created_at: string;
  handled_at: string | null;
};

type QueueItem = {
  id: number;
  reward_id: number;
  name: string;
  cost: number;
  created_at: string;
  nickname: string;
  avatar_color: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "รอรับของ",
  fulfilled: "รับของแล้ว",
  rejected: "ถูกปฏิเสธ (คืน XP)",
};

export default function RewardsPanel({ canManage }: { canManage: boolean }) {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [mine, setMine] = useState<Redemption[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [xp, setXp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const [form, setForm] = useState({ name: "", description: "", cost: "50", stock: "" });

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ rewards: Reward[]; mine: Redemption[]; queue: QueueItem[]; xp: number }>("/api/rewards");
      setRewards(res.rewards);
      setMine(res.mine);
      setQueue(res.queue);
      setXp(res.xp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดร้านค้าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function redeem(reward: Reward) {
    if (!confirm(`แลก "${reward.name}" ด้วย ${reward.cost} XP?`)) return;
    setBusy(reward.id);
    setError(null);
    setNotice(null);
    try {
      const res = await apiPost<{ xp: number }>("/api/rewards/redeem", { rewardId: reward.id });
      setXp(res.xp);
      setNotice("แลกแล้ว — รอแอดมินมอบของรางวัลให้");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "แลกของรางวัลไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function handle(id: number, action: "fulfill" | "reject") {
    setBusy(id);
    try {
      await apiPatch(`/api/rewards/redemptions/${id}`, { action });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "จัดการรายการไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setBusy(-1);
    try {
      await apiPost("/api/rewards", {
        name: form.name,
        description: form.description,
        cost: Number(form.cost),
        stock: form.stock ? Number(form.stock) : null,
      });
      setForm({ name: "", description: "", cost: "50", stock: "" });
      setNotice("เพิ่มของรางวัลเข้าร้านแล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มของรางวัลไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-slate-400">แต้ม XP ที่ใช้ได้</p>
          <p className="text-2xl font-bold text-white">{xp} XP</p>
        </div>
        <p className="max-w-sm text-[11px] text-slate-500">
          แลกของรางวัลด้วยแต้ม XP ที่สะสมจากการเช็กชื่อ ทำการบ้าน และช่วยเพื่อน — ของรางวัลจะถูกมอบโดยผู้ดูแล
        </p>
      </div>

      {loading ? (
        <div className="h-32 animate-pulse rounded-2xl bg-white/5" />
      ) : rewards.length === 0 ? (
        <Empty icon="trophy" title="ร้านค้ายังว่าง" hint={canManage ? "เพิ่มของรางวัลได้จากแบบฟอร์มด้านล่าง" : "รอแอดมินเพิ่มของรางวัล"} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rewards.map((reward) => {
            const soldOut = reward.stock !== null && reward.redeemed >= reward.stock;
            const affordable = xp >= reward.cost;
            return (
              <div key={reward.id} className={`card p-4 ${reward.active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">{reward.name}</h3>
                  <span className="badge shrink-0 bg-indigo-500/15 text-indigo-300 ring-indigo-400/30">{reward.cost} XP</span>
                </div>
                {reward.description ? <p className="mt-1 text-xs text-slate-400">{reward.description}</p> : null}
                <p className="mt-2 text-[11px] text-slate-500">
                  {reward.stock === null ? "ไม่จำกัดจำนวน" : `เหลือ ${Math.max(0, reward.stock - reward.redeemed)}/${reward.stock}`}
                  {reward.redeemed > 0 ? ` · แลกไปแล้ว ${reward.redeemed}` : ""}
                </p>
                <button
                  onClick={() => void redeem(reward)}
                  disabled={!reward.active || soldOut || !affordable || busy === reward.id}
                  className="btn btn-primary btn-sm mt-3 w-full disabled:opacity-40"
                >
                  <Icon name="trophy" className="size-3.5" />
                  {soldOut ? "แลกหมดแล้ว" : reward.active ? (affordable ? "แลกของรางวัล" : "XP ไม่พอ") : "ปิดรับแลก"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="รายการแลกของฉัน" icon="trophy">
          {mine.length === 0 ? (
            <p className="text-xs text-slate-500">ยังไม่เคยแลกของรางวัล</p>
          ) : (
            <ul className="space-y-2">
              {mine.map((row) => (
                <li key={row.id} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">{row.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {STATUS_LABEL[row.status] ?? row.status} · {relativeTime(row.created_at)}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-rose-300">-{row.cost} XP</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {canManage ? (
          <SectionCard title="เพิ่มของรางวัลเข้าร้าน" icon="plus">
            <form onSubmit={create} className="space-y-2">
              <input
                className="input text-sm"
                placeholder="ชื่อของรางวัล (เช่น เลือกที่นั่ง 1 สัปดาห์)"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                maxLength={120}
                required
              />
              <textarea
                className="input resize-y text-sm"
                rows={2}
                placeholder="รายละเอียด / วิธีรับของ"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                maxLength={500}
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-400">
                  ราคา (XP)
                  <input
                    type="number"
                    min={1}
                    className="input mt-1 text-sm"
                    value={form.cost}
                    onChange={(event) => setForm({ ...form, cost: event.target.value })}
                  />
                </label>
                <label className="text-[11px] text-slate-400">
                  จำนวนจำกัด (เว้นว่าง = ไม่จำกัด)
                  <input
                    type="number"
                    min={0}
                    className="input mt-1 text-sm"
                    value={form.stock}
                    onChange={(event) => setForm({ ...form, stock: event.target.value })}
                  />
                </label>
              </div>
              <button className="btn btn-ghost w-full" disabled={busy === -1}>
                <Icon name="plus" className="size-4" /> เพิ่มของรางวัล
              </button>
            </form>
          </SectionCard>
        ) : null}
      </div>

      {canManage ? (
        <SectionCard title="คิวรอส่งของรางวัล" icon="users">
          {queue.length === 0 ? (
            <p className="text-xs text-slate-500">ไม่มีรายการค้าง</p>
          ) : (
            <ul className="space-y-2">
              {queue.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] p-3">
                  <Avatar name={row.nickname} color={row.avatar_color} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-100">
                      {row.nickname} · {row.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {row.cost} XP · {relativeTime(row.created_at)}
                    </p>
                  </div>
                  <button onClick={() => void handle(row.id, "fulfill")} disabled={busy === row.id} className="btn btn-primary btn-sm">
                    มอบแล้ว
                  </button>
                  <button onClick={() => void handle(row.id, "reject")} disabled={busy === row.id} className="btn btn-danger btn-sm">
                    ปฏิเสธ + คืน XP
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : null}
    </div>
  );
}
