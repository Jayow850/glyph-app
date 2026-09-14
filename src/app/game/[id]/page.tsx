import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LiveGameBoard } from "@/components/LiveGameBoard";
import Link from "next/link";

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;

  const game = await prisma.liveGame.findUnique({
    where: { id },
    include: {
      white: { include: { profile: true } },
      black: { include: { profile: true } },
    },
  });

  if (!game) return <p style={{ paddingTop: 32 }}>Game not found.</p>;

  const youAre = game.whiteId === userId ? "w" : game.blackId === userId ? "b" : null;

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 className="font-display" style={{ fontSize: 22, flex: 1 }}>
          {game.white.profile?.fullName ?? "White"} vs {game.black.profile?.fullName ?? "Black"}
        </h1>
        <Link href="/challenges" className="text-ivory-meta" style={{ fontSize: 13 }}>← Games</Link>
      </div>

      <LiveGameBoard
        gameId={game.id}
        initialFen={game.fen}
        initialSans={game.sans}
        youAre={youAre}
        whiteName={game.white.profile?.fullName ?? "White"}
        blackName={game.black.profile?.fullName ?? "Black"}
        status={game.status}
        result={game.result}
      />
    </div>
  );
}