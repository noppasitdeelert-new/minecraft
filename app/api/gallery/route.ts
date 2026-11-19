import { ApiError, fail, json, optionalStr, readJson, str } from "@/lib/api";
import { all, one, run, nowIso } from "@/lib/db";
import { canModerate, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/integrations";
import type { GalleryPhoto } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_CHARS = 3_000_000; // ~2.2MB binary after base64

export async function GET() {
  try {
    await requireUser();
    const rows = await all<{
      id: number;
      title: string;
      image_url: string;
      caption: string | null;
      created_at: string;
      author_id: number;
      nickname: string;
      real_name: string;
      role: GalleryPhoto["author"]["role"];
      avatar_color: string;
    }>(
      `SELECT g.id, g.title, g.image_url, g.caption, g.created_at,
              u.id AS author_id, u.nickname, u.real_name, u.role, u.avatar_color
         FROM gallery_photos g JOIN users u ON u.id = g.user_id
        ORDER BY g.created_at DESC
        LIMIT 120`,
    );

    const photos: GalleryPhoto[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      image_url: r.image_url,
      caption: r.caption,
      created_at: r.created_at,
      author: { id: r.author_id, nickname: r.nickname, real_name: r.real_name, role: r.role, avatar_color: r.avatar_color },
    }));

    return json({ photos });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await readJson<{ title?: string; image_url?: string; caption?: string }>(req);
    const title = str(body.title, "ชื่อรูป", 140);
    const url = str(body.image_url, "รูปภาพ", MAX_IMAGE_CHARS);

    const isData = /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(url);
    const isHttp = /^https?:\/\/.+/i.test(url);
    if (!isData && !isHttp) throw new ApiError(400, "รองรับเฉพาะไฟล์รูปภาพหรือลิงก์ http(s)");
    if (url.length > MAX_IMAGE_CHARS) throw new ApiError(413, "ไฟล์รูปใหญ่เกินไป (สูงสุด ~2 MB)");

    const res = await run(
      "INSERT INTO gallery_photos (user_id, title, image_url, caption, created_at) VALUES (?, ?, ?, ?, ?)",
      user.id,
      title,
      url,
      optionalStr(body.caption, 500),
      nowIso(),
    );
    await logAudit(user.id, "gallery.create", `photo:${res.lastInsertRowid}`, title);
    return json({ ok: true, id: res.lastInsertRowid });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = Number(new URL(req.url).searchParams.get("id") || 0);
    const photo = await one<{ user_id: number; title: string }>("SELECT user_id, title FROM gallery_photos WHERE id = ?", id);
    if (!photo) throw new ApiError(404, "ไม่พบรูปนี้");
    if (photo.user_id !== user.id && !canModerate(user.role)) throw new ApiError(403, "ไม่มีสิทธิ์ลบรูปนี้");
    await run("DELETE FROM gallery_photos WHERE id = ?", id);
    await logAudit(user.id, "gallery.delete", `photo:${id}`, photo.title);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
