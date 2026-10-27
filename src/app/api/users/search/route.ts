import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { displayRating } from "@/lib/services/ratings";
import type { SpeedCategory } from "@prisma/client";

type Reason = "friend" | "recent" | "club" | "search" | "new";

const REASON_LABEL: Record<Reason, string> = {
  friend: "Following",
  recent: "Played recently",
  club: "Your club",
  search: "",
  new: "On GLYPH",
};

async function hydrate(ids: string[], reasons: Map<string, Reason>, category: SpeedCategory) {
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, bannedAt: null },
    include: { profile: true, glyphRatings: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  // Keep the order we worked out, not the order the database felt like.
  return ids
    .map((id) => byId.get(id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => ({
      id: u.id,
      handle: u.profile?.handle ?? "",
      fullName: u.profile?.fullName ?? u.profile?.handle ?? "Player",
      country: u.profile?.country ?? null,
      rating: displayRating(u.glyphRatings.find((r) => r.category === category)),
      reason: REASON_LABEL[reasons.get(u.id) ?? "search"],
    }));
}

/**
 * Who to play.
 *
 * With a query this searches handles and names. Without one it answers
 * the more common question — "who can I play right now?" — with the
 * people you follow, then recent opponents, then your club, then anyone
 * else. An empty search box should never be an empty screen.
 */
export async function GET(req: NextRequest) {
  const userId = await requireUser();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const category = (req.nextUrl.searchParams.get("category") ?? "RAPID") as SpeedCategory;

  if (q.length >= 2) {
    const users = await prisma.user.findMany({
      where: {
        id: { not: userId },
        bannedAt: null,
        profile: {
          OR: [
            { handle: { contains: q, mode: "insensitive" } },
            { fullName: { contains: q, mode: "insensitive" } },
          ],
        },
      },
      include: { profile: true, glyphRatings: true },
      take: 8,
    });

    return NextResponse.json({
      suggested: false,
      players: users.map((u) => ({
        id: u.id,
        handle: u.profile?.handle ?? "",
        fullName: u.profile?.fullName ?? u.profile?.handle ?? "Player",
        country: u.profile?.country ?? null,
        rating: displayRating(u.glyphRatings.find((r) => r.category === category)),
        reason: "",
      })),
    });
  }

  const [follows, myClubs, recentGames] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true }, take: 50 }),
    prisma.membership.findMany({ where: { userId, active: true }, select: { clubId: true } }),
    prisma.liveGame.findMany({
      where: { OR: [{ whiteId: userId }, { blackId: userId }] },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { whiteId: true, blackId: true },
    }),
  ]);

  const clubMates = myClubs.length
    ? await prisma.membership.findMany({
        where: { clubId: { in: myClubs.map((m) => m.clubId) }, userId: { not: userId }, active: true },
        select: { userId: true },
        take: 40,
      })
    : [];

  const seen = new Set<string>([userId]);
  const reasons = new Map<string, Reason>();
  const ordered: string[] = [];

  const push = (ids: string[], reason: Reason) => {
    for (const id of ids) {
      if (seen.has(id) || ordered.length >= 12) continue;
      seen.add(id);
      reasons.set(id, reason);
      ordered.push(id);
    }
  };

  push(follows.map((f) => f.followingId), "friend");
  push(recentGames.flatMap((g) => [g.whiteId, g.blackId]), "recent");
  push(clubMates.map((m) => m.userId), "club");

  // Still thin? Round it out with anyone else on the platform.
  if (ordered.length < 8) {
    const others = await prisma.user.findMany({
      where: { id: { notIn: [...seen] }, bannedAt: null },
      select: { id: true },
      take: 12 - ordered.length,
    });
    push(others.map((o) => o.id), "new");
  }

  return NextResponse.json({
    suggested: true,
    players: await hydrate(ordered, reasons, category),
  });
}
