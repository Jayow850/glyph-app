import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LiveGameBoard } from "@/components/LiveGameBoard";
import { readClocks } from "@/lib/game-clock";
import { displayRating } from "@/lib/services/ratings";
import { parseId, label, CATEGORY_LABEL } from "@engine/game/timeControls";
import Link from "next/link";

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;

  const game = await prisma.liveGame.findUnique({
    where: { id },
    include: {
      white: { include: { profile: true } },
      black: { include: { profile: true } },
      match: { include: { round: { include: { tournament: true } } } },
    },
  });

  if (!game) return <p style={{ paddingTop: 32 }}>Game not found.</p>;

  const board = game.match;
  const youAre = game.whiteId === userId ? "w" : game.blackId === userId ? "b" : null;

  const [whiteRating, blackRating] = await Promise.all([
    prisma.glyphRating.findUnique({
      where: { userId_category: { userId: game.whiteId, category: game.category } },
    }),
    prisma.glyphRating.findUnique({
      where: { userId_category: { userId: game.blackId, category: game.category } },
    }),
  ]);

  // Read the clocks on the server so the first paint is already honest.
  const clocks = readClocks(game);
  const { base, increment } = parseId(game.timeControl);

  return (
    <>
      {board && (
        <Link
          href={`/tournaments/${board.round.tournamentId}`}
          className="desktop-only"
          style={{
            textDecoration: "none", marginBottom: "var(--s3)",
            fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600,
            color: "var(--gold)", background: "var(--gold-wash)",
            borderRadius: 7, padding: "5px 10px", width: "fit-content",
          }}
        >
          {board.round.tournament.name} · Round {board.round.number} · Board {board.boardNumber}
        </Link>
      )}

      <LiveGameBoard
        gameId={game.id}
        youId={userId}
        initialFen={game.fen}
        initialSans={game.sans}
        youAre={youAre}
        whiteName={game.white.profile?.fullName ?? "White"}
        blackName={game.black.profile?.fullName ?? "Black"}
        whiteRating={displayRating(whiteRating)}
        blackRating={displayRating(blackRating)}
        whiteCountry={game.white.profile?.country ?? null}
        blackCountry={game.black.profile?.country ?? null}
        whiteTitle={game.white.profile?.title ?? null}
        blackTitle={game.black.profile?.title ?? null}
        status={game.status}
        result={game.result}
        endReason={game.endReason}
        initialWhiteMs={clocks.whiteMs}
        initialBlackMs={clocks.blackMs}
        initialDrawOfferBy={game.drawOfferBy as "w" | "b" | null}
        initialTicking={clocks.ticking}
        initialWhiteDelta={game.whiteRatingDelta}
        initialBlackDelta={game.blackRatingDelta}
        rated={game.rated}
        timeControl={label(base, increment)}
        speedLabel={CATEGORY_LABEL[game.category]}
        incrementMs={game.incrementMs}
        startedAt={game.createdAt.toISOString()}
        updatedAt={game.updatedAt.toISOString()}
      />
    </>
  );
}
