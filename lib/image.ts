/** Resize an image file in the browser to a compact JPEG data URL. */
export async function fileToDataUrl(file: File, maxSize = 1400, quality = 0.82): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("ไฟล์ที่เลือกไม่ใช่รูปภาพ");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ไม่สามารถประมวลผลรูปภาพได้");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return canvas.toDataURL("image/jpeg", quality);
}
