import { redirect } from "next/navigation";
import ProfileClient from "@/components/ProfileClient";
import { getSessionUser } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { levelFromXp } from "@/lib/levels";
import { grantedTitles } from "@/lib/xp";

export const dynamic = "force-dynamic";
export const metadata = { title: "โปรไฟล์ · SKC105 Room Hub" };

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [messages, resources, votes, attendance, granted, recentXp, rank] = await Promise.all([
    one<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE user_id = ?", user.id),
    one<{ n: number }>("SELECT COUNT(*) AS n FROM resources WHERE created_by = ?", user.id),
    one<{ n: number }>("SELECT COUNT(*) AS n FROM poll_votes WHERE user_id = ?", user.id),
    one<{ n: number }>("SELECT COUNT(*) AS n FROM attendance WHERE user_id = ? AND status IN ('present','late')", user.id),
    grantedTitles(user.id),
    all<{ amount: number; reason: string; created_at: string }>(
      "SELECT amount, reason, created_at FROM xp_log WHERE user_id = ? ORDER BY id DESC LIMIT 6",
      user.id,
    ),
    one<{ position: number }>(
      `SELECT COUNT(*) + 1 AS position FROM users WHERE status = 'active' AND xp > ?`,
      user.xp,
    ),
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
        avatar_url: user.avatar_url,
        xp: user.xp,
        bio: user.bio,
        title: user.title,
        created_at: user.created_at,
        last_login_at: user.last_login_at,
      }}
      level={levelFromXp(user.xp)}
      grantedTitles={granted}
      rank={rank?.position ?? 1}
      recentXp={recentXp}
      stats={{
        messages: messages?.n ?? 0,
        resources: resources?.n ?? 0,
        votes: votes?.n ?? 0,
        attendance: attendance?.n ?? 0,
      }}
    />
  );
}
