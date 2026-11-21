import { canManage, requireUser } from "@/lib/auth";
import KeyLinkClient from "@/components/KeyLinkClient";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "ตัวช่วยลิงก์คีย์ · SKC105 Room Hub" };

export default async function KeyLinkPage() {
  const user = await requireUser();

  return (
    <div>
      <PageHeader
        title="ตัวช่วยลิงก์คีย์"
        description="วางลิงก์รับคีย์ ตรวจสอบให้แน่ใจก่อนปลดล็อก แล้วคัดลอกคีย์ที่ได้ไปสมัครได้ทันที — ประวัติย้อนหลังเก็บในบัญชีของคุณ"
        icon="link"
      />
      <KeyLinkClient nickname={user.nickname} canManage={canManage(user.role)} />
    </div>
  );
}
