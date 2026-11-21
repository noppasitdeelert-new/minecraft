import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import GameRoomClient from "@/components/games/GameRoomClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "ห้องเล่นเกมกระดาน · SKC105 Room Hub" };

export default async function GameRoomPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const roomId = Number(id);
  if (!Number.isInteger(roomId) || roomId <= 0) notFound();

  return (
    <div>
      <GameRoomClient roomId={roomId} />
      <p className="mt-6 text-center text-[11px] text-slate-600">
        <Link href="/games" className="hover:text-slate-400">
          ← กลับล็อบบี้เกมกระดาน
        </Link>
      </p>
    </div>
  );
}
