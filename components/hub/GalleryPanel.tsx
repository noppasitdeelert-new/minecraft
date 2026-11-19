"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/client";
import { formatDateShort } from "@/lib/format";
import { fileToDataUrl } from "@/lib/image";
import type { GalleryPhoto } from "@/lib/types";
import { Alert, Avatar, Empty, RoleBadge } from "../ui";
import { Icon } from "../icons";

export default function GalleryPanel({ me, canManage }: { me: { id: number; role: string }; canManage: boolean }) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState(false);
  const [form, setForm] = useState({ title: "", caption: "", image_url: "", urlMode: false });
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ photos: GalleryPhoto[] }>("/api/gallery");
      setPhotos(res.photos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดแกลเลอรีไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function pickFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((prev) => ({ ...prev, image_url: dataUrl, title: prev.title || file.name.replace(/\.[^.]+$/, "") }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "อ่านไฟล์รูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiPost("/api/gallery", { title: form.title, caption: form.caption, image_url: form.image_url });
      setForm({ title: "", caption: "", image_url: "", urlMode: false });
      setComposer(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: GalleryPhoto) {
    if (!confirm("ลบรูปนี้?")) return;
    try {
      await apiDelete(`/api/gallery?id=${photo.id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบรูปไม่สำเร็จ");
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">อัลบั้มรูปกิจกรรมของห้อง · {photos.length} รูป</p>
        <button onClick={() => setComposer((v) => !v)} className="btn btn-primary btn-sm">
          <Icon name="camera" className="size-3.5" /> อัปโหลดรูป
        </button>
      </div>

      {composer ? (
        <form onSubmit={submit} className="card space-y-2.5 border-indigo-400/25 bg-indigo-500/[0.06] p-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void pickFile(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-ghost btn-sm">
              <Icon name="camera" className="size-3.5" /> เลือกรูปจากเครื่อง
            </button>
            <button type="button" onClick={() => setForm({ ...form, urlMode: !form.urlMode })} className="text-[11px] text-indigo-300 hover:text-indigo-200">
              หรือใส่ลิงก์รูปภาพ
            </button>
            {form.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.image_url} alt="ตัวอย่าง" className="ml-auto h-12 w-16 rounded-lg object-cover ring-1 ring-white/10" />
            ) : null}
          </div>

          {form.urlMode ? (
            <input className="input" placeholder="https://... ลิงก์รูปภาพ" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
          ) : null}

          <input className="input" placeholder="ชื่อรูป / หัวข้อกิจกรรม" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <input className="input" placeholder="คำบรรยาย (ไม่บังคับ)" value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} />

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setComposer(false)} className="btn btn-ghost btn-sm">
              ยกเลิก
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy || !form.image_url}>
              {busy ? "กำลังบันทึก..." : "ลงอัลบั้ม"}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="h-28 animate-pulse rounded-2xl bg-white/5" />
      ) : photos.length === 0 ? (
        <Empty icon="camera" title="ยังไม่มีรูปในอัลบั้ม" hint="อัปโหลดรูปกิจกรรมแรกของห้องได้เลย" />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <figure key={photo.id} className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
              <button onClick={() => setPreview(photo.image_url)} className="block aspect-4/3 w-full overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.image_url}
                  alt={photo.title}
                  loading="lazy"
                  className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
                />
              </button>
              <figcaption className="p-2.5">
                <p className="truncate text-[11px] font-medium text-slate-100">{photo.title}</p>
                <p className="flex items-center gap-1 truncate text-[10px] text-slate-500">
                  <Avatar name={photo.author.nickname} color={photo.author.avatar_color} size={14} />
                  {photo.author.nickname}
                  <RoleBadge role={photo.author.role} className="!px-1 !py-0 !text-[8px]" />
                  <span className="ml-auto">{formatDateShort(photo.created_at)}</span>
                </p>
              </figcaption>
              {photo.author.id === me.id || canManage ? (
                <button
                  onClick={() => remove(photo)}
                  className="absolute top-1.5 right-1.5 rounded-lg bg-black/60 p-1.5 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-rose-300"
                  title="ลบรูป"
                >
                  <Icon name="trash" className="size-3.5" />
                </button>
              ) : null}
            </figure>
          ))}
        </div>
      )}

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setPreview(null)}>
          <button className="absolute top-4 right-4 rounded-lg bg-white/10 p-2 text-white" aria-label="ปิด">
            <Icon name="close" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="รูปกิจกรรม" className="max-h-full max-w-full rounded-2xl object-contain" />
        </div>
      ) : null}
    </div>
  );
}
