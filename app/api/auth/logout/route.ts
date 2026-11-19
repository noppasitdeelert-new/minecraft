import { fail, json } from "@/lib/api";
import { destroySession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    await destroySession();
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
