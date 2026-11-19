import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import RegisterForm from "@/components/RegisterForm";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "สมัครสมาชิก · SKC105 Room Hub" };

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/home");
  return (
    <AuthShell>
      <RegisterForm />
    </AuthShell>
  );
}
