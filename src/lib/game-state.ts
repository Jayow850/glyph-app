import { prisma } from "@/lib/prisma";
import { readClocks } from "@/lib/game-clock";

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

/** The one shape every game endpoint answers with, clocks read fresh. */
export async function gameStatePayload(id: string) {
  const g = await prisma.liveGame.findUniqueOrThrow({ where: { id }, select: SELECT });
  const clocks = readClocks(g);
  return {
    fen: g.fen,
    sans: g.sans,
    status: g.status,
    result: g.result,
    endReason: g.endReason,
    whiteMs: clocks.whiteMs,
    blackMs: clocks.blackMs,
    turn: clocks.turn,
    ticking: clocks.ticking,
    drawOfferBy: g.drawOfferBy,
    whiteRatingDelta: g.whiteRatingDelta,
    blackRatingDelta: g.blackRatingDelta,
  };
}
