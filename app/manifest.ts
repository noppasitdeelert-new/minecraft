import type { MetadataRoute } from "next";

export const dynamic = "force-static";

/** ทำให้เว็บติดตั้งเป็นแอปบนมือถือ/เดสก์ท็อปได้ (PWA) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SKC105 Room Hub",
    short_name: "SKC105",
    description: "ศูนย์รวมห้อง SKC105 — ประกาศ แชต ประชุม การบ้าน ตารางเรียน และคลังข้อมูลของห้อง",
    id: "/home",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070b16",
    theme_color: "#070b16",
    lang: "th",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
