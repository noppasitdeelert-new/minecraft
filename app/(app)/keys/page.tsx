import { canManage, requireUser } from "@/lib/auth";
import KeysClient from "@/components/KeysClient";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "คีย์ห้อง · SKC105 Room Hub" };

export default async function KeysPage() {
  const user = await requireUser();

  return (
    <div>
      <PageHeader
        title="คีย์ห้อง SKC105"
        description="ขอคีย์ให้เพื่อน · ติดตามสถานะคำขอ · แอดมินสร้างลิงก์แชร์คีย์แบบมีโทเคนและวันหมดอายุ"
        icon="key"
      />
      <KeysClient canManage={canManage(user.role)} />
    </div>
  );
}
