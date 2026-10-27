import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readClocks, timeoutOutcome } from "@/lib/game-clock";
import { settleIfFinished } from "@/lib/services/ratings";

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

  const game = await prisma.liveGame.findUnique({ where: { id }, select: SELECT });
  if (!game) return NextResponse.json({ error: "not_found" }, { status: 404 });

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

  return NextResponse.json({
    fen: game.fen,
    sans: game.sans,
    status: game.status,
    result: game.result,
    endReason: game.endReason,
    whiteMs: clocks.whiteMs,
    blackMs: clocks.blackMs,
    turn: clocks.turn,
    ticking: clocks.ticking,
    drawOfferBy: game.drawOfferBy,
    whiteRatingDelta: game.whiteRatingDelta,
    blackRatingDelta: game.blackRatingDelta,
  });
}
