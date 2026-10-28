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

/**
 * The one shape every game endpoint answers with, clocks read fresh.
 *
 * The latest chat line rides along deliberately. The board already
 * polls this every few seconds; a second poll for messages would
 * double the traffic to tell the player something the first call was
 * already in a position to mention.
 */
export async function gameStatePayload(id: string) {
  const [g, latest, game] = await Promise.all([
    prisma.liveGame.findUniqueOrThrow({ where: { id }, select: SELECT }),
    prisma.gameMessage.findFirst({
      where: { gameId: id },
      orderBy: { createdAt: "desc" },
      include: { user: { include: { profile: true } } },
    }),
    prisma.liveGame.findUniqueOrThrow({
      where: { id },
      select: { whiteId: true, blackId: true },
    }),
  ]);

  // A rematch offer between these two, still open. Reported here so
  // both sides see the same pending state and the same countdown
  // rather than each guessing from their own last click.
  const pair = [game.whiteId, game.blackId];
  const rematch = await prisma.challenge.findFirst({
    where: {
      status: "pending",
      message: "Rematch?",
      fromId: { in: pair },
      toId: { in: pair },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, fromId: true, expiresAt: true },
  });
  const clocks = readClocks(g);
  return {
    rematch: rematch && {
      id: rematch.id,
      fromId: rematch.fromId,
      expiresAt: rematch.expiresAt?.getTime() ?? null,
    },
    chat: latest && {
      id: latest.id,
      userId: latest.userId,
      name: latest.user.profile?.fullName ?? "Player",
      body: latest.body,
      kind: latest.kind,
      at: latest.createdAt.getTime(),
    },
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
