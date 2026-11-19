import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import LoginForm from "@/components/LoginForm";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "เข้าสู่ระบบ · SKC105 Room Hub" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/home");
  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
