import { requireUser } from "@/lib/auth";
import LanClient from "@/components/lan/LanClient";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "LAN / VPN เล่นด้วยกัน · SKC105 Room Hub" };

export default async function LanPage() {
  await requireUser();

  return (
    <div>
      <PageHeader
        title="LAN / VPN เล่นไมน์คราฟต์ด้วยกัน"
        description="ศูนย์นัดเล่นโลก LAN ของห้อง — สร้างห้อง แชร์ Network ID กับ IP:port ให้เพื่อนกดต่อ พร้อมคู่มือตั้งค่า ZeroTier / Tailscale / Radmin VPN และอัปเดตสถานะห้องแบบเรียลไทม์"
        icon="globe"
      />
      <LanClient />
    </div>
  );
}
