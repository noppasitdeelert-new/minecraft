import { requireUser } from "@/lib/auth";
import GamesLobbyClient from "@/components/games/GamesLobbyClient";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "เกมกระดาน 1v1 · SKC105 Room Hub" };

export default async function GamesPage() {
  await requireUser();

  return (
    <div>
      <PageHeader
        title="SKC105 Classic Board Games"
        description="หมากฮอส · หมากรุก · เรียง 5 · เรียง 4 — ดวล 1v1 กับเพื่อนแบบเรียลไทม์ หรือซ้อมกับบอท AI พร้อมสถิติ Elo และแต้ม XP"
        icon="trophy"
      />
      <GamesLobbyClient />
    </div>
  );
}
