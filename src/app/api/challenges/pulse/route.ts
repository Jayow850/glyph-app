import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseId, label, classify, CATEGORY_LABEL } from "@engine/game/timeControls";
import { displayRating } from "@/lib/services/ratings";

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

  // Being here counts as being online. Guarded on staleness so a poll
  // every three seconds does not mean a write every three seconds.
  void prisma.profile.updateMany({
    where: { userId, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: new Date(now - 60_000) } }] },
    data: { lastSeenAt: new Date(now) },
  }).catch(() => {});

  const [incoming, accepted] = await Promise.all([
    prisma.challenge.findMany({
      where: {
        toId: userId,
        status: "pending",
        createdAt: { gte: new Date(now - FRESH_MS) },
      },
      include: { from: { include: { profile: true, glyphRatings: true } } },
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
      // How long the toast may live: whatever is left of the challenge.
      const deadline = (c.expiresAt ?? new Date(c.createdAt.getTime() + FRESH_MS)).getTime();
      return {
        id: c.id,
        name: c.from.profile?.fullName ?? "A player",
        handle: c.from.profile?.handle ?? "",
        country: c.from.profile?.country ?? null,
        title: c.from.profile?.title ?? null,
        rating: displayRating(
          c.from.glyphRatings.find((r) => r.category === classify(base, increment)),
        ),
        clock: label(base, increment),
        speed: CATEGORY_LABEL[classify(base, increment)],
        rated: c.rated,
        message: c.message,
        secondsLeft: Math.max(0, Math.round((deadline - now) / 1000)),
      };
    }),
    started: accepted.map((c) => ({ challengeId: c.id, gameId: c.liveGameId as string })),
  });
}
