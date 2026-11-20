import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hasGroqKey } from "@/lib/nox";
import NoxClient from "@/components/NoxClient";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nox AI · SKC105 Room Hub" };

export default async function NoxPage() {
  const user = await requireUser();
  const messages = await all<{ id: number; role: "user" | "assistant"; body: string; created_at: string }>(
    "SELECT id, role, body, created_at FROM nox_messages WHERE user_id = ? ORDER BY id DESC LIMIT 60",
    user.id,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nox — ผู้ช่วย AI ของห้อง ม.105"
        description="ถามเรื่องสวนชล ห้อง ม.105 การเรียน และเรื่องทั่วไปได้เลย — Nox พัฒนาโดย team Noxvalis"
        icon="spark"
      />
      <NoxClient
        initialMessages={messages.reverse()}
        configured={hasGroqKey()}
        nickname={user.nickname}
      />
    </div>
  );
}
