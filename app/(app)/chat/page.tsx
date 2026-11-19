import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { Channel } from "@/lib/types";
import ChatClient from "@/components/ChatClient";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const user = await requireUser();

  const channels = await all<Channel>(
    `SELECT c.id, c.slug, c.name, c.description, c.icon, c.sort_order,
            (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id) AS message_count
       FROM channels c ORDER BY c.sort_order, c.id`,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="แชตห้อง SKC105"
        description="พูดคุยแยกตามหมวดหมู่ — ข้อความใหม่จะอัปเดตอัตโนมัติทุก 3 วินาที"
        icon="chat"
      />
      <ChatClient
        channels={channels}
        me={{ id: user.id, nickname: user.nickname, role: user.role, avatar_color: user.avatar_color }}
      />
    </div>
  );
}
