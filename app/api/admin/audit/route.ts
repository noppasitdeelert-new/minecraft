import { fail, json } from "@/lib/api";
import { all } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import type { AuditLog } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireManager();
    const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit") || 100), 10), 300);
    const logs = await all<AuditLog>(
      `SELECT l.id, l.action, l.target, l.detail, l.created_at,
              u.nickname AS actor_nickname, u.role AS actor_role
         FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id
        ORDER BY l.id DESC LIMIT ?`,
      limit,
    );
    return json({ logs });
  } catch (error) {
    return fail(error);
  }
}
