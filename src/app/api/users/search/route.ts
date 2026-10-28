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

export interface FoundPlayer {
  id: string;
  handle: string;
  fullName: string;
  country: string | null;
  /** ChessTitle, or null. */
  title: string | null;
  rating: string;
  reason: string;
  /** Head-to-head from the searcher's point of view. */
  h2h: { w: number; l: number; d: number } | null;
  lastPlayed: string | null;
}

/**
 * Head-to-head against each candidate. Rivalry is the emotional core of
 * club chess — knowing you are 3–1 down to someone before you challenge
 * them is more motivating than any rating number.
 */
async function headToHead(userId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, { w: number; l: number; d: number; at: Date }>();

  const games = await prisma.liveGame.findMany({
    where: {
      status: "FINISHED",
      OR: [
        { whiteId: userId, blackId: { in: ids } },
        { blackId: userId, whiteId: { in: ids } },
      ],
    },
    select: { whiteId: true, blackId: true, result: true, updatedAt: true },
  });

  const table = new Map<string, { w: number; l: number; d: number; at: Date }>();
  for (const g of games) {
    const iAmWhite = g.whiteId === userId;
    const them = iAmWhite ? g.blackId : g.whiteId;
    const row = table.get(them) ?? { w: 0, l: 0, d: 0, at: g.updatedAt };

    if (g.result === "1/2-1/2") row.d++;
    else if ((g.result === "1-0") === iAmWhite) row.w++;
    else row.l++;

    if (g.updatedAt > row.at) row.at = g.updatedAt;
    table.set(them, row);
  }
  return table;
}

async function shape(
  ids: string[],
  reasons: Map<string, Reason>,
  category: SpeedCategory,
  viewerId: string,
): Promise<FoundPlayer[]> {
  if (ids.length === 0) return [];

  const [users, h2h] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids }, bannedAt: null },
      include: { profile: true, glyphRatings: true },
    }),
    headToHead(viewerId, ids),
  ]);

  const byId = new Map(users.map((u) => [u.id, u]));

  // Keep the order we worked out, not the order the database felt like.
  return ids
    .map((id) => byId.get(id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => {
      const record = h2h.get(u.id);
      return {
        id: u.id,
        handle: u.profile?.handle ?? "",
        fullName: u.profile?.fullName ?? u.profile?.handle ?? "Player",
        country: u.profile?.country ?? null,
        title: u.profile?.title ?? null,
        rating: displayRating(u.glyphRatings.find((r) => r.category === category)),
        reason: REASON_LABEL[reasons.get(u.id) ?? "search"],
        h2h: record ? { w: record.w, l: record.l, d: record.d } : null,
        lastPlayed: record ? record.at.toISOString() : null,
      };
    });
}

/**
 * Who to play. With a query this searches handles and names; without one
 * it answers the more common question — "who can I play right now?" —
 * with the people you follow, then recent opponents, then your club.
 * An empty search box should never be an empty screen.
 */
export async function GET(req: NextRequest) {
  const userId = await requireUser();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const category = (req.nextUrl.searchParams.get("category") ?? "RAPID") as SpeedCategory;
  const scope = req.nextUrl.searchParams.get("scope") ?? "all"; // all | club | recent | following

  if (q.length >= 2) {
    const found = await prisma.user.findMany({
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
      select: { id: true },
      take: 12,
    });
    const ids = found.map((f) => f.id);
    const reasons = new Map<string, Reason>(ids.map((id) => [id, "search" as Reason]));
    return NextResponse.json({ suggested: false, players: await shape(ids, reasons, category, userId) });
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
      if (seen.has(id) || ordered.length >= 14) continue;
      seen.add(id);
      reasons.set(id, reason);
      ordered.push(id);
    }
  };

  if (scope === "club") {
    push(clubMates.map((m) => m.userId), "club");
  } else if (scope === "recent") {
    push(recentGames.flatMap((g) => [g.whiteId, g.blackId]), "recent");
  } else if (scope === "following") {
    push(follows.map((f) => f.followingId), "friend");
  } else {
    push(follows.map((f) => f.followingId), "friend");
    push(recentGames.flatMap((g) => [g.whiteId, g.blackId]), "recent");
    push(clubMates.map((m) => m.userId), "club");

    if (ordered.length < 8) {
      const others = await prisma.user.findMany({
        where: { id: { notIn: [...seen] }, bannedAt: null },
        select: { id: true },
        take: 14 - ordered.length,
      });
      push(others.map((o) => o.id), "new");
    }
  }

  return NextResponse.json({ suggested: true, players: await shape(ordered, reasons, category, userId) });
}
