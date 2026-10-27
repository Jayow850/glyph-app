import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseId, label, classify, CATEGORY_LABEL } from "@engine/game/timeControls";

/**
 * The heartbeat behind challenge notifications.
 *
 * Two questions in one round trip:
 *   1. Has anyone challenged me? (ring, and offer accept/decline anywhere)
 *   2. Has a challenge I sent been accepted? (take me to the board)
 *
 * The second one is the whole point. Before this, the player who sent
 * the challenge sat on a static page while their opponent was already
 * at the board waiting — the worst possible first impression.
 *
 * Live challenges go stale: a ten-minute-old invitation should not ring
 * a bell, the way a live challenge on Chess.com times out rather than
 * sitting there forever.
 */
const FRESH_MS = 15 * 60 * 1000;   // a challenge worth ringing about
const RECENT_MS = 3 * 60 * 1000;   // an acceptance worth jumping to

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ incoming: [], started: [] });

  const now = Date.now();

  const [incoming, accepted] = await Promise.all([
    prisma.challenge.findMany({
      where: {
        toId: userId,
        status: "pending",
        createdAt: { gte: new Date(now - FRESH_MS) },
      },
      include: { from: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.challenge.findMany({
      where: {
        fromId: userId,
        status: "accepted",
        liveGameId: { not: null },
        createdAt: { gte: new Date(now - RECENT_MS) },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);

  return NextResponse.json({
    incoming: incoming.map((c) => {
      const { base, increment } = parseId(c.timeControl);
      return {
        id: c.id,
        name: c.from.profile?.fullName ?? "A player",
        handle: c.from.profile?.handle ?? "",
        clock: label(base, increment),
        speed: CATEGORY_LABEL[classify(base, increment)],
        rated: c.rated,
        message: c.message,
      };
    }),
    started: accepted.map((c) => ({ challengeId: c.id, gameId: c.liveGameId as string })),
  });
}
