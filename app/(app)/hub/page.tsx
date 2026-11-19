import { canModerate, requireUser } from "@/lib/auth";
import HubClient from "@/components/hub/HubClient";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HubPage() {
  const user = await requireUser();
  return (
    <div>
      <PageHeader
        title="คลังข้อมูลของห้อง"
        description="โหวต ชีทสรุป บอร์ดถาม-ตอบ ยืม-คืนของส่วนกลาง และอัลบั้มรูปกิจกรรม"
        icon="hub"
      />
      <HubClient me={{ id: user.id, role: user.role }} canManage={canModerate(user.role)} />
    </div>
  );
}
