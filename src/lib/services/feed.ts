import { prisma } from "../prisma";
import { cached } from "../redis";

const POST_INCLUDE = {
  author: { include: { profile: true, ratings: { where: { clubId: null, timeControl: "RAPID" as const } } } },
  club: { select: { name: true, slug: true } },
  _count: { select: { comments: true } },
  reactions: { select: { kind: true, reactorElo: true } },
} as const;

function score(p: { createdAt: Date; reactions: { kind: string; reactorElo: number | null }[]; viewCount: number; _count: { comments: number } }) {
  const hours = (Date.now() - p.createdAt.getTime()) / 3.6e6;
  const pawns = p.reactions.filter((r) => r.kind === "PAWN").length;
  // Brilliants are weighted by reactor Elo — a GM crown is worth ~5 pawns
  const brilliants = p.reactions
    .filter((r) => r.kind === "BRILLIANT")
    .reduce((s, r) => s + 1 + ((r.reactorElo ?? 1200) - 1200) / 300, 0);
  const engagement = pawns + brilliants * 3 + p._count.comments * 2 + p.viewCount * 0.02;
  return engagement / Math.pow(hours + 2, 1.6); // time-decayed
}

/** For You: engagement-ranked, time-decayed, 5-minute cache. */
export async function forYou(limit = 30) {
  return cached("feed:foryou", 300, async () => {
    const posts = await prisma.post.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 72 * 3.6e6) } },
      include: POST_INCLUDE,
      take: 200,
      orderBy: { createdAt: "desc" },
    });
    return posts.sort((a, b) => score(b) - score(a)).slice(0, limit);
  });
}

/** Following: chronological from followed authors + own posts. */
export async function following(userId: string, cursor?: string) {
  const follows = await prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } });
  return prisma.post.findMany({
    where: { authorId: { in: [...follows.map((f) => f.followingId), userId] } },
    include: POST_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 30,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });
}

/** Clubs: posts from the user's clubs. */
export async function clubsFeed(userId: string) {
  const memberships = await prisma.membership.findMany({ where: { userId, active: true }, select: { clubId: true } });
  return prisma.post.findMany({
    where: { clubId: { in: memberships.map((m) => m.clubId) } },
    include: POST_INCLUDE,
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 30,
  });
}

/** Live Now: LIVE posts from the last 6 hours. */
export async function liveNow() {
  return prisma.post.findMany({
    where: { type: "LIVE", createdAt: { gte: new Date(Date.now() - 6 * 3.6e6) } },
    include: POST_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

/** Rising: posts gaining brilliants fastest in the last 6 hours. */
export async function rising() {
  return cached("feed:rising", 120, async () => {
    const posts = await prisma.post.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 3.6e6) } },
      include: POST_INCLUDE,
      take: 100,
      orderBy: { createdAt: "desc" },
    });
    const velocity = (p: (typeof posts)[0]) => {
      const recent = p.reactions.filter((r) => r.kind === "BRILLIANT").length;
      const hours = Math.max(1, (Date.now() - p.createdAt.getTime()) / 3.6e6);
      return recent / hours;
    };
    return posts.sort((a, b) => velocity(b) - velocity(a)).slice(0, 20);
  });
}

/** Clips tab: vertical CLIP posts. */
export async function clips(cursor?: string) {
  return prisma.post.findMany({
    where: { type: "CLIP" },
    include: POST_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: 10,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });
}
