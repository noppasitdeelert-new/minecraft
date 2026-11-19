import { ApiError, fail, json, optionalStr, readJson } from "@/lib/api";
import { randomCode } from "@/lib/crypto";
import { all, one, run, nowIso } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { logAudit, notifyChannels } from "@/lib/integrations";
import type { InviteKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing 0/O/1/I

function generateCode(): string {
  return `SKC105-${randomCode(6, ALPHABET)}`;
}

export async function GET() {
  try {
    await requireManager();
    const keys = await all<InviteKey>(
      `SELECT k.id, k.code, k.note, k.created_at, k.used_at,
              ub.nickname AS used_by_nickname, cb.nickname AS creator_nickname
         FROM invite_keys k
         LEFT JOIN users ub ON ub.id = k.used_by
         LEFT JOIN users cb ON cb.id = k.created_by
        ORDER BY (k.used_at IS NOT NULL) ASC, k.created_at DESC`,
    );

    return json({
      keys,
      stats: {
        available: keys.filter((k) => !k.used_at).length,
        used: keys.filter((k) => k.used_at).length,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireManager();
    const body = await readJson<{ note?: string; count?: number }>(req);
    const count = Math.min(Math.max(Number(body.count ?? 1), 1), 20);
    const note = optionalStr(body.note, 200);

    const created: string[] = [];
    for (let i = 0; i < count; i += 1) {
      let code = generateCode();
      let attempts = 0;
      while (await one("SELECT id FROM invite_keys WHERE code = ?", code) && attempts < 10) {
        code = generateCode();
        attempts += 1;
      }
      await run("INSERT INTO invite_keys (code, note, created_by, created_at) VALUES (?, ?, ?, ?)", code, note, admin.id, nowIso());
      created.push(code);
    }

    await logAudit(admin.id, "invite.create", `invite:${created.join(",")}`, `สร้างคีย์ห้อง ${created.length} คีย์`);
    return json({ ok: true, codes: created });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await requireManager();
    const id = Number(new URL(req.url).searchParams.get("id") || 0);
    const key = await one<{ code: string; used_at: string | null }>("SELECT code, used_at FROM invite_keys WHERE id = ?", id);
    if (!key) throw new ApiError(404, "ไม่พบคีย์นี้");
    await run("DELETE FROM invite_keys WHERE id = ?", id);
    await logAudit(admin.id, "invite.delete", `invite:${key.code}`, key.used_at ? "ลบคีย์ที่ใช้แล้ว" : "ลบคีย์ที่ยังไม่ถูกใช้");
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

/** Send the newest unused key to Discord/LINE (used by the "ส่งคีย์เข้า Discord" button). */
export async function PATCH() {
  try {
    const admin = await requireManager();
    const key = await one<{ code: string }>("SELECT code FROM invite_keys WHERE used_at IS NULL ORDER BY id DESC LIMIT 1");
    if (!key) throw new ApiError(404, "ยังไม่มีคีย์ที่ว่างใช้งาน");
    await notifyChannels(`🔑 คีย์เข้าห้อง SKC105 (ใช้ได้ 1 ครั้ง): \`${key.code}\`\nสร้างโดย ${admin.nickname}`);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
