"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/client";
import { formatDateShort, relativeTime } from "@/lib/format";
import type { InventoryItem } from "@/lib/types";
import { Alert, Avatar, Empty } from "../ui";
import { Icon } from "../icons";

export default function InventoryPanel({ me, canManage }: { me: { id: number; role: string }; canManage: boolean }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", description: "", total_qty: 1 });
  const [borrowOpen, setBorrowOpen] = useState<number | null>(null);
  const [borrowForm, setBorrowForm] = useState({ qty: 1, due_at: "" });

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ items: InventoryItem[] }>("/api/inventory");
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดคลังของไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addItem(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await apiPost("/api/inventory", newItem);
      setNewItem({ name: "", description: "", total_qty: 1 });
      setAddOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เพิ่มของไม่สำเร็จ");
    }
  }

  async function borrow(item: InventoryItem) {
    setError(null);
    try {
      await apiPost(`/api/inventory/${item.id}`, { action: "borrow", qty: borrowForm.qty, due_at: borrowForm.due_at });
      setBorrowOpen(null);
      setBorrowForm({ qty: 1, due_at: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ยืมไม่สำเร็จ");
    }
  }

  async function returnLoan(item: InventoryItem, loanId: number) {
    setError(null);
    try {
      await apiPost(`/api/inventory/${item.id}`, { action: "return", loan_id: loanId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "คืนไม่สำเร็จ");
    }
  }

  async function removeItem(item: InventoryItem) {
    if (!confirm(`ลบ "${item.name}" ออกจากคลัง?`)) return;
    try {
      await apiDelete(`/api/inventory?id=${item.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  const activeLoans = items.flatMap((item) =>
    item.loans.filter((l) => !l.returned_at).map((loan) => ({ item, loan })),
  );

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">ของส่วนกลางของห้อง · กำลังถูกยืม {activeLoans.length} รายการ</p>
        {canManage ? (
          <button onClick={() => setAddOpen((v) => !v)} className="btn btn-ghost btn-sm">
            <Icon name="plus" className="size-3.5" /> เพิ่มสิ่งของ
          </button>
        ) : null}
      </div>

      {addOpen ? (
        <form onSubmit={addItem} className="card space-y-2.5 border-indigo-400/25 bg-indigo-500/[0.06] p-4">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <input className="input sm:col-span-2" placeholder="ชื่อสิ่งของ" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} required />
            <input
              type="number"
              min={1}
              className="input"
              placeholder="จำนวนทั้งหมด"
              value={newItem.total_qty}
              onChange={(e) => setNewItem({ ...newItem, total_qty: Number(e.target.value) })}
              required
            />
          </div>
          <input className="input" placeholder="รายละเอียด / เงื่อนไขการใช้" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAddOpen(false)} className="btn btn-ghost btn-sm">
              ยกเลิก
            </button>
            <button className="btn btn-primary btn-sm">เพิ่มเข้าคลัง</button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="h-28 animate-pulse rounded-2xl bg-white/5" />
      ) : items.length === 0 ? (
        <Empty icon="box" title="ยังไม่มีของส่วนกลาง" hint="แอดมินสามารถเพิ่มอุปกรณ์ของห้องได้" />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {items.map((item) => {
            const available = item.total_qty - item.borrowed_qty;
            const mineLoans = item.loans.filter((l) => !l.returned_at);
            return (
              <div key={item.id} className="card p-4">
                <div className="flex items-start gap-2">
                  <span className="rounded-xl bg-emerald-500/10 p-2 text-emerald-300">
                    <Icon name="box" className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{item.name}</p>
                    {item.description ? <p className="text-[11px] text-slate-400">{item.description}</p> : null}
                  </div>
                  {canManage ? (
                    <button onClick={() => removeItem(item)} className="rounded p-1 text-slate-600 hover:text-rose-400">
                      <Icon name="trash" className="size-3.5" />
                    </button>
                  ) : null}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`badge ${available > 0 ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30" : "bg-rose-500/15 text-rose-300 ring-rose-400/30"}`}>
                    ว่าง {available}/{item.total_qty}
                  </span>
                  {available > 0 ? (
                    borrowOpen === item.id ? (
                      <span className="flex flex-1 flex-wrap items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={available}
                          className="input w-16 py-1 text-xs"
                          value={borrowForm.qty}
                          onChange={(e) => setBorrowForm({ ...borrowForm, qty: Number(e.target.value) })}
                        />
                        <input
                          type="date"
                          className="input w-auto py-1 text-xs"
                          value={borrowForm.due_at}
                          onChange={(e) => setBorrowForm({ ...borrowForm, due_at: e.target.value })}
                        />
                        <button onClick={() => borrow(item)} className="btn btn-primary btn-sm">
                          ยืนยันยืม
                        </button>
                        <button onClick={() => setBorrowOpen(null)} className="btn btn-ghost btn-sm">
                          ยกเลิก
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setBorrowOpen(item.id)} className="btn btn-ghost btn-sm">
                        ยืมของ
                      </button>
                    )
                  ) : (
                    <span className="text-[11px] text-slate-500">ไม่ว่างให้ยืม</span>
                  )}
                </div>

                {mineLoans.length > 0 ? (
                  <ul className="mt-2 space-y-1 border-t border-white/8 pt-2">
                    {mineLoans.map((loan) => (
                      <li key={loan.id} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Avatar name={loan.borrower.nickname} color={loan.borrower.avatar_color} size={16} />
                        <span className="text-slate-300">{loan.borrower.nickname}</span>
                        <span>ยืม {loan.qty} ชิ้น · {relativeTime(loan.borrowed_at)}</span>
                        {loan.due_at ? <span className="text-amber-300/80">กำหนดคืน {formatDateShort(loan.due_at)}</span> : null}
                        {loan.borrower.id === me.id || canManage ? (
                          <button onClick={() => returnLoan(item, loan.id)} className="ml-auto rounded bg-white/5 px-2 py-0.5 text-emerald-300 hover:bg-white/10">
                            คืนแล้ว
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
