import { ApiError, fail, json, str } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { hasExaKey, searchWeb } from "@/lib/exa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser();
    if (!hasExaKey()) throw new ApiError(503, "ยังไม่ได้ตั้งค่า EXA_API_KEY สำหรับค้นหาเว็บ");

    const params = new URL(req.url).searchParams;
    const query = str(params.get("q"), "คำค้นหา", 300);
    const results = await searchWeb(query, Number(params.get("limit") ?? 5));
    return json({ query, results });
  } catch (error) {
    return fail(error);
  }
}
