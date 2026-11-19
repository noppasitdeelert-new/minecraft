import { redirect } from "next/navigation";
import { canManage, requireUser } from "@/lib/auth";
import AdminClient from "@/components/AdminClient";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser();
  if (!canManage(user.role)) redirect("/home");

  return (
    <div>
      <PageHeader
        title="จัดการระบบห้อง SKC105"
        description="สร้างคีย์เชิญ ดูรายชื่อสมาชิกทั้งหมด จัดการยศ/สถานะ ตั้งค่าแจ้งเตือน และตรวจสอบ Audit Logs"
        icon="shield"
      />
      <AdminClient me={{ id: user.id, role: user.role, nickname: user.nickname }} />
    </div>
  );
}
