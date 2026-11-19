import { ApiError, fail, intParam, json, optionalStr, readJson } from "@/lib/api";
import { one, run, nowIso } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const itemId = intParam((await ctx.params).id, "itemId");
    const item = await one<{ id: number; name: string; total_qty: number }>(
      "SELECT id, name, total_qty FROM inventory_items WHERE id = ?",
      itemId,
    );
    if (!item) throw new ApiError(404, "ไม่พบสิ่งของนี้");

    const body = await readJson<{ action?: string; qty?: number; due_at?: string; loan_id?: number; note?: string }>(req);

    if (body.action === "borrow") {
      const qty = Number(body.qty ?? 1);
      if (!Number.isInteger(qty) || qty < 1) throw new ApiError(400, "จำนวนที่ยืมไม่ถูกต้อง");

      const borrowed = await one<{ total: number }>(
        "SELECT COALESCE(SUM(qty), 0) AS total FROM inventory_loans WHERE item_id = ? AND returned_at IS NULL",
        itemId,
      );
      const available = item.total_qty - Number(borrowed?.total ?? 0);
      if (qty > available) throw new ApiError(400, `ของเหลือให้ยืม ${Math.max(available, 0)} ชิ้น`);

      const dueRaw = optionalStr(body.due_at, 20);
      const due = dueRaw ? dueRaw.slice(0, 10) : null;
      await run(
        "INSERT INTO inventory_loans (item_id, user_id, qty, borrowed_at, due_at, note) VALUES (?, ?, ?, ?, ?, ?)",
        itemId,
        user.id,
        qty,
        nowIso(),
        due,
        optionalStr(body.note, 300),
      );
      await logAudit(user.id, "inventory.borrow", `item:${itemId}`, `ยืม ${item.name} จำนวน ${qty}`);
      return json({ ok: true });
    }

    if (body.action === "return") {
      const loanId = Number(body.loan_id ?? 0);
      const loan = await one<{ id: number; user_id: number; returned_at: string | null; qty: number }>(
        "SELECT id, user_id, returned_at, qty FROM inventory_loans WHERE id = ? AND item_id = ?",
        loanId,
        itemId,
      );
      if (!loan) throw new ApiError(404, "ไม่พบรายการยืมนี้");
      if (loan.returned_at) throw new ApiError(400, "รายการนี้คืนแล้ว");
      if (loan.user_id !== user.id && !canModerate(user.role)) throw new ApiError(403, "คืนได้เฉพาะผู้ยืมหรือแอดมิน");

      await run("UPDATE inventory_loans SET returned_at = ? WHERE id = ?", nowIso(), loanId);
      await logAudit(user.id, "inventory.return", `item:${itemId}`, `คืน ${item.name} จำนวน ${loan.qty}`);
      return json({ ok: true });
    }

    throw new ApiError(400, "ไม่รู้จักคำสั่งนี้");
  } catch (error) {
    return fail(error);
  }
}
