import { NextResponse, type NextRequest } from "next/server";

/**
 * เว็บนี้ต้องเป็น HTTPS เท่านั้น
 *
 * Cloudflare ส่ง `x-forwarded-proto` มาให้ทุก request ถ้าเป็น http (เช่นมีคนพิมพ์
 * http:// เอง หรือ проксиหน้าเว็บไม่ได้อัปเกรด) เราจะตอบ 308 ไปยัง https ทันที
 * โดยยังคง path + query เดิมไว้ เพื่อไม่ให้ลิงก์ที่แชร์กันไว้หลุด
 *
 * ยกเว้นเฉพาะโฮสต์สำหรับพัฒนาในเครื่อง ซึ่งรันด้วย http://localhost
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

function isLocalHost(host: string): boolean {
  const raw = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  const name = raw.toLowerCase();
  return LOCAL_HOSTS.has(name) || name.endsWith(".local") || name === "freebuff-next-local";
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || req.nextUrl.host;
  if (isLocalHost(host)) return NextResponse.next();

  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0].trim().toLowerCase();
  const insecure = forwarded === "http" || (!forwarded && req.nextUrl.protocol === "http:");

  if (insecure) {
    // ตอบ Response ตรง ๆ: NextResponse.redirect + clone() บน workerd ยังคงใช้ scheme เดิม
    return new Response(null, {
      status: 308,
      headers: {
        Location: `https://${host}${req.nextUrl.pathname}${req.nextUrl.search}`,
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
