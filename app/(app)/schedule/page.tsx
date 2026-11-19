import { canModerate, requireUser } from "@/lib/auth";
import ScheduleClient from "@/components/ScheduleClient";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const user = await requireUser();
  return (
    <div>
      <PageHeader
        title="ตารางเรียนและกำหนดการ"
        description="ตารางเรียนรายสัปดาห์ ตารางเวรประจำวัน นัดหมายสำคัญ และการเช็กชื่อเข้าเรียน"
        icon="calendar"
      />
      <ScheduleClient canEdit={canModerate(user.role)} />
    </div>
  );
}
