import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/**
 * Applied to every response.
 * - HSTS + preload: เบราว์เซอร์จะไม่ยอมกลับไปใช้ http อีก
 * - upgrade-insecure-requests: กันรูป/สคริปต์ที่ฝังมาแบบ http ถูกโหลดแบบไม่เข้ารหัส
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: "upgrade-insecure-requests" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
    // Keep recently visited pages in the client router cache so going back to
    // a page you just opened is instant instead of a full server round trip.
    staleTimes: { dynamic: 30, static: 300 },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev({ configPath: "./freebuff.wrangler.jsonc" });
}

export default nextConfig;
