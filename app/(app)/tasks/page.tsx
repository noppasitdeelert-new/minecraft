import { canModerate, requireUser } from "@/lib/auth";
import TasksClient from "@/components/TasksClient";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await requireUser();
  return (
    <div>
      <PageHeader
        title="การบ้านและงานที่ต้องส่ง"
        description="แยกตามรายวิชา ระบุวันครบกำหนด และให้ทุกคนอัปเดตสถานะงานของตัวเอง"
        icon="tasks"
      />
      <TasksClient me={{ id: user.id, role: user.role }} canManage={canModerate(user.role)} />
    </div>
  );
}
