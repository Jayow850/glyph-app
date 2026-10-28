import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { sideToMove } from "@/lib/game-clock";
import { settleIfFinished } from "@/lib/services/ratings";

/**
 * How long an opponent must be gone before you may claim the game.
 * Not exported: a route module may only export HTTP handlers and
 * Next's own config names, and anything else fails the build.
 */
const AWAY_MS = 60_000;

/**
 * Claim a game your opponent has walked out of.
 *
 * Deliberately a claim and not an automatic forfeit. A phone that
 * locks, a tunnel, a backgrounded tab — all of these look exactly like
 * leaving, and a system that resolves them on its own will eventually
 * take a game off someone who was still there. So the absence is
 * detected automatically and the decision is left to the person who is
 * actually sitting there waiting.
 *
 * The clock makes this fair in the other direction too: an absent
 * player's time is running the whole while, so on a short time control
 * they flag before this matters. It is long games this is for.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  const game = await prisma.liveGame.findUnique({ where: { id } });
  if (!game) return NextResponse.json({ error: "no_such_game" }, { status: 404 });
  if (game.status !== "ACTIVE") {
    return NextResponse.json({ error: "already_finished" }, { status: 409 });
  }

  const youAreWhite = game.whiteId === userId;
  if (!youAreWhite && game.blackId !== userId) {
    return NextResponse.json({ error: "not_a_player" }, { status: 403 });
  }

  // Only the side to move can be said to have abandoned: a player
  // waiting for their opponent is not required to sit and watch.
  const turn = sideToMove(game.fen);
  const theirTurn = turn === (youAreWhite ? "b" : "w");
  if (!theirTurn) {
    return NextResponse.json({ error: "their_clock_is_not_running" }, { status: 400 });
  }

  const seen = youAreWhite ? game.blackSeenAt : game.whiteSeenAt;
  const away = seen ? Date.now() - seen.getTime() : null;
  if (away === null || away < AWAY_MS) {
    return NextResponse.json({ error: "still_here", awayMs: away ?? 0 }, { status: 400 });
  }

  const loserId = youAreWhite ? game.blackId : game.whiteId;

  const finished = await prisma.liveGame.updateMany({
    where: { id, status: "ACTIVE" },
    data: {
      status: "FINISHED",
      result: youAreWhite ? "1-0" : "0-1",
      endReason: "abandoned",
      drawOfferBy: null,
    },
  });
  if (finished.count === 0) {
    return NextResponse.json({ error: "already_finished" }, { status: 409 });
  }

  // Rated as an ordinary loss, and counted, because a club needs to
  // know who does this repeatedly.
  await Promise.all([
    settleIfFinished(id, "FINISHED"),
    prisma.profile.updateMany({ where: { userId: loserId }, data: { abandons: { increment: 1 } } }),
  ]);

  return NextResponse.json({ ok: true, result: youAreWhite ? "1-0" : "0-1" });
}
