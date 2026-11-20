import { redirect } from "next/navigation";
import ProfileClient from "@/components/ProfileClient";
import { getSessionUser } from "@/lib/auth";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "โปรไฟล์ · SKC105 Room Hub" };

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [messages, resources, votes, attendance] = await Promise.all([
    one<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE user_id = ?", user.id),
    one<{ n: number }>("SELECT COUNT(*) AS n FROM resources WHERE created_by = ?", user.id),
    one<{ n: number }>("SELECT COUNT(*) AS n FROM poll_votes WHERE user_id = ?", user.id),
    one<{ n: number }>("SELECT COUNT(*) AS n FROM attendance WHERE user_id = ? AND status IN ('present','late')", user.id),
  ]);

  return (
    <ProfileClient
      profile={{
        id: user.id,
        email: user.email,
        real_name: user.real_name,
        nickname: user.nickname,
        role: user.role,
        avatar_color: user.avatar_color,
        created_at: user.created_at,
        last_login_at: user.last_login_at,
      }}
      stats={{
        messages: messages?.n ?? 0,
        resources: resources?.n ?? 0,
        votes: votes?.n ?? 0,
        attendance: attendance?.n ?? 0,
      }}
    />
  );
}
