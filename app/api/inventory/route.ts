import { ApiError, fail, json, optionalStr, readJson, str } from "@/lib/api";
import { all, one, run, nowIso } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";
import type { InventoryItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();

    const items = await all<{ id: number; name: string; description: string | null; total_qty: number; borrowed_qty: number }>(
      `SELECT i.id, i.name, i.description, i.total_qty,
              COALESCE((SELECT SUM(l.qty) FROM inventory_loans l WHERE l.item_id = i.id AND l.returned_at IS NULL), 0) AS borrowed_qty
         FROM inventory_items i
        ORDER BY i.id`,
    );

    const loans = await all<{
      id: number;
      item_id: number;
      qty: number;
      borrowed_at: string;
      due_at: string | null;
      returned_at: string | null;
      user_id: number;
      nickname: string;
      real_name: string;
      role: InventoryItem["loans"][number]["borrower"]["role"];
      avatar_color: string;
    }>(
      `SELECT l.id, l.item_id, l.qty, l.borrowed_at, l.due_at, l.returned_at,
              u.id AS user_id, u.nickname, u.real_name, u.role, u.avatar_color
         FROM inventory_loans l JOIN users u ON u.id = l.user_id
        ORDER BY (l.returned_at IS NULL) DESC, l.borrowed_at DESC
        LIMIT 300`,
    );

    const result: InventoryItem[] = items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      total_qty: i.total_qty,
      borrowed_qty: Number(i.borrowed_qty),
      loans: loans
        .filter((l) => l.item_id === i.id)
        .map((l) => ({
          id: l.id,
          qty: l.qty,
          borrowed_at: l.borrowed_at,
          due_at: l.due_at,
          returned_at: l.returned_at,
          borrower: {
            id: l.user_id,
            nickname: l.nickname,
            real_name: l.real_name,
            role: l.role,
            avatar_color: l.avatar_color,
          },
        })),
    }));

    return json({ items: result });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canModerate(user.role)) throw new ApiError(403, "เฉพาะแอดมินหรือผู้ดูแลเท่านั้นที่เพิ่มรายการของส่วนกลาง");
    const body = await readJson<{ name?: string; description?: string; total_qty?: number }>(req);
    const name = str(body.name, "ชื่อสิ่งของ", 120);
    const qty = Number(body.total_qty ?? 1);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) throw new ApiError(400, "จำนวนต้องเป็นเลขจำนวนเต็ม 1-999");

    const res = await run(
      "INSERT INTO inventory_items (name, description, total_qty, created_at) VALUES (?, ?, ?, ?)",
      name,
      optionalStr(body.description, 500),
      qty,
      nowIso(),
    );
    await logAudit(user.id, "inventory.create", `item:${res.lastInsertRowid}`, name);
    return json({ ok: true, id: res.lastInsertRowid });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    if (!canModerate(user.role)) throw new ApiError(403, "ไม่มีสิทธิ์ลบรายการนี้");
    const id = Number(new URL(req.url).searchParams.get("id") || 0);
    const item = await one<{ name: string }>("SELECT name FROM inventory_items WHERE id = ?", id);
    if (!item) throw new ApiError(404, "ไม่พบสิ่งของนี้");
    await run("DELETE FROM inventory_items WHERE id = ?", id);
    await logAudit(user.id, "inventory.delete", `item:${id}`, item.name);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
