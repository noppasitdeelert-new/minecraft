import { redirect } from "next/navigation";
import Shell from "@/components/Shell";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <Shell
      user={{
        id: user.id,
        nickname: user.nickname,
        real_name: user.real_name,
        email: user.email,
        role: user.role,
        avatar_color: user.avatar_color,
        avatar_url: user.avatar_url,
      }}
    >
      {children}
    </Shell>
  );
}
