import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { readClocks, timeoutOutcome, sideToMove } from "@/lib/game-clock";
import { settleIfFinished } from "@/lib/services/ratings";
import { gameStatePayload } from "@/lib/game-state";

const SELECT = {
  fen: true,
  sans: true,
  status: true,
  result: true,
  endReason: true,
  whiteMs: true,
  blackMs: true,
  lastMoveAt: true,
  clockStarted: true,
  drawOfferBy: true,
  whiteRatingDelta: true,
  blackRatingDelta: true,
} as const;

/**
 * Poll endpoint. Besides reporting the position it is also where a
 * flag-fall gets noticed: a player can lose on time without anyone
 * touching a piece, so the clock has to be settled on read, not only
 * when a move arrives.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const game = await prisma.liveGame.findUnique({
    where: { id },
    select: { ...SELECT, whiteId: true, blackId: true, whiteSeenAt: true, blackSeenAt: true },
  });
  if (!game) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Polling IS presence. A player with the board open is at the board,
  // so there is no separate heartbeat to keep in step with this one.
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;
  const youAreWhite = userId !== null && userId === game.whiteId;
  const youArePlayer = youAreWhite || (userId !== null && userId === game.blackId);

  if (youArePlayer && game.status === "ACTIVE") {
    const mine = youAreWhite ? game.whiteSeenAt : game.blackSeenAt;
    // Written at most every ten seconds: the board polls far more often
    // than presence needs, and a write per poll per player is waste.
    if (!mine || Date.now() - mine.getTime() > 10_000) {
      void prisma.liveGame
        .update({
          where: { id },
          data: youAreWhite ? { whiteSeenAt: new Date() } : { blackSeenAt: new Date() },
        })
        .catch(() => {});
    }
  }

  const clocks = readClocks(game);

  if (clocks.flagged) {
    const { result, endReason } = timeoutOutcome(game.fen);
    await prisma.liveGame.update({
      where: { id },
      data: {
        status: "FINISHED",
        result,
        endReason,
        whiteMs: clocks.whiteMs,
        blackMs: clocks.blackMs,
        drawOfferBy: null,
      },
    });
    await settleIfFinished(id, "FINISHED");

    const settled = await prisma.liveGame.findUniqueOrThrow({ where: { id }, select: SELECT });
    return NextResponse.json({
      fen: settled.fen,
      sans: settled.sans,
      status: settled.status,
      result: settled.result,
      endReason: settled.endReason,
      whiteMs: settled.whiteMs,
      blackMs: settled.blackMs,
      turn: clocks.turn,
      ticking: false,
      drawOfferBy: null,
      whiteRatingDelta: settled.whiteRatingDelta,
      blackRatingDelta: settled.blackRatingDelta,
    });
  }

  // How long the other side has been gone, but only while it is their
  // move — a player waiting on you has not abandoned anything.
  let opponentAwayMs = 0;
  if (youArePlayer && game.status === "ACTIVE") {
    const theirTurn = sideToMove(game.fen) === (youAreWhite ? "b" : "w");
    const theirs = youAreWhite ? game.blackSeenAt : game.whiteSeenAt;
    if (theirTurn && theirs) opponentAwayMs = Math.max(0, Date.now() - theirs.getTime());
  }

  const payload = await gameStatePayload(id);
  return NextResponse.json({ ...payload, opponentAwayMs });
}
