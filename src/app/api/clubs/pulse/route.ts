import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/** Seen within this window counts as online. */
const ONLINE_MS = 3 * 60 * 1000;

/**
 * What the club is doing right now.
 *
 * This exists so the rail is never a blank band. When nobody is
 * watching your game, the space under the board says how many members
 * are around and what else is being played, with somewhere to tap —
 * which is the difference between an app you open to play and a place
 * you open to be in.
 */
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ online: 0, games: [] });

  const memberships = await prisma.membership.findMany({
    where: { userId, active: true },
    select: { clubId: true },
  });
  const clubIds = memberships.map((m) => m.clubId);
  if (clubIds.length === 0) return NextResponse.json({ online: 0, games: [] });

  const members = await prisma.membership.findMany({
    where: { clubId: { in: clubIds }, active: true },
    select: { userId: true },
  });
  const memberIds = [...new Set(members.map((m) => m.userId))];

  const since = new Date(Date.now() - ONLINE_MS);

  const [online, games] = await Promise.all([
    prisma.profile.count({
      where: { userId: { in: memberIds }, lastSeenAt: { gte: since } },
    }),
    prisma.liveGame.findMany({
      where: {
        status: "ACTIVE",
        whiteId: { in: memberIds },
        blackId: { in: memberIds },
        NOT: { OR: [{ whiteId: userId }, { blackId: userId }] },
      },
      include: {
        white: { include: { profile: true } },
        black: { include: { profile: true } },
      },
      orderBy: { lastMoveAt: "desc" },
      take: 8,
    }),
  ]);

  // One grouped count rather than a query per game.
  const watching = await prisma.spectator.groupBy({
    by: ["liveGameId"],
    where: {
      liveGameId: { in: games.map((g) => g.id) },
      lastSeenAt: { gte: new Date(Date.now() - 25_000) },
    },
    _count: { _all: true },
  });
  const watchers = new Map(watching.map((w) => [w.liveGameId, w._count._all]));

  return NextResponse.json({
    online,
    games: games.map((g) => ({
      id: g.id,
      white: g.white.profile?.fullName ?? "White",
      black: g.black.profile?.fullName ?? "Black",
      moves: Math.ceil(g.sans.length / 2),
      timeControl: g.timeControl,
      watching: watchers.get(g.id) ?? 0,
    })),
  });
}
