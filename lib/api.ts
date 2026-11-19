import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(error: unknown): NextResponse {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  console.error("[api]", error);
  const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด";
  return json({ error: message }, 500);
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") throw new Error("bad body");
    return body as T;
  } catch {
    throw new ApiError(400, "ข้อมูลที่ส่งมาไม่ถูกต้อง");
  }
}

export function str(value: unknown, field: string, max = 5000): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw new ApiError(400, `กรุณากรอก${field}`);
  if (s.length > max) throw new ApiError(400, `${field}ยาวเกินไป`);
  return s;
}

export function optionalStr(value: unknown, max = 5000): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return null;
  return s.slice(0, max);
}

export function intParam(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `${field} ไม่ถูกต้อง`);
  return n;
}
