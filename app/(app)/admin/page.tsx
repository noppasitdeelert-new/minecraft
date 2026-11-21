import { redirect } from "next/navigation";
import { canManage, requireUser } from "@/lib/auth";
import AdminClient from "@/components/AdminClient";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser();
  if (!canManage(user.role)) redirect("/home");

  return (
    <div>
      <PageHeader
        title="จัดการระบบห้อง SKC105"
        description="สร้างคีย์เชิญ ดูรายชื่อสมาชิกทั้งหมด จัดการยศ/สถานะ ตั้งค่าแจ้งเตือน ตรวจสอบ Audit Logs และสำรองข้อมูล"
        icon="shield"
        action={
          <a href="/api/admin/export" className="btn btn-ghost btn-sm" title="ดาวน์โหลดข้อมูลทั้งระบบเป็นไฟล์ JSON">
            <Icon name="download" className="size-4" /> สำรองข้อมูล JSON
          </a>
        }
      />
      <AdminClient me={{ id: user.id, role: user.role, nickname: user.nickname }} />
    </div>
  );
}
