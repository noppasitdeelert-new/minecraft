import MusicClient from "@/components/MusicClient";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "เพลงห้อง · SKC105 Room Hub" };

export default function MusicPage() {
  return (
    <div>
      <PageHeader
        title="เพลงห้อง SKC105"
        description="ทุกคนฟังเพลงเดียวกันตามลำดับคิว — แอดมินค้นหาและดาวน์โหลดเพลงเก็บไว้ในเว็บได้จากหน้าจัดการระบบ"
        icon="music"
      />
      <MusicClient />
    </div>
  );
}
