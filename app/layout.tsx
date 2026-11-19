import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  display: "swap",
  variable: "--font-noto-thai",
});

export const metadata: Metadata = {
  title: "SKC105 Room Hub",
  description: "ศูนย์รวมห้อง SKC105 — ประกาศ แชต ประชุม การบ้าน ตารางเรียน และคลังข้อมูลของห้อง",
};

export const viewport: Viewport = {
  themeColor: "#070b16",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={notoThai.variable}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
