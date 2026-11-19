import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Index() {
  const user = await getSessionUser();
  redirect(user ? "/home" : "/login");
}
