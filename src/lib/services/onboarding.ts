import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notifications";

/**
 * Joining a club, as an event the club notices.
 *
 * The research on community retention is unanimous and unglamorous:
 * first interactions decide whether someone stays, and being greeted
 * by an existing member is the interaction that matters. A club that
 * does not notice you joined is not a community — it is a list you
 * are on.
 *
 * So joining produces three things: a post the club can see and reply
 * to, a named person responsible for you in your first week, and a
 * tickable first step. None of them are points or badges; all of them
 * are a person noticing another person.
 */

/** How long a host is responsible for a newcomer. */
export const HOST_DAYS = 7;

/** Someone who has played inside this window counts as active. */
const ACTIVE_DAYS = 7;

/** A host should be a peer, not the club champion. */
const RATING_BAND = 400;

/**
 * Pick a host for a newcomer.
 *
 * Prefers an Organizer or Coach, then the member closest in rating,
 * and only ever someone who has actually played recently — being
 * assigned a dormant member is worse than being assigned nobody,
 * because it looks like the club tried and nobody came.
 */
export async function pickHost(clubId: string, newUserId: string): Promise<string | null> {
  const since = new Date(Date.now() - ACTIVE_DAYS * 86_400_000);

  const [candidates, newcomer] = await Promise.all([
    prisma.membership.findMany({
      where: { clubId, active: true, userId: { not: newUserId } },
      include: { user: { include: { glyphRatings: true } } },
    }),
    prisma.glyphRating.findFirst({ where: { userId: newUserId, category: "RAPID" } }),
  ]);
  if (candidates.length === 0) return null;

  const recent = await prisma.liveGame.findMany({
    where: {
      updatedAt: { gte: since },
      OR: [
        { whiteId: { in: candidates.map((c) => c.userId) } },
        { blackId: { in: candidates.map((c) => c.userId) } },
      ],
    },
    select: { whiteId: true, blackId: true },
  });
  const active = new Set(recent.flatMap((g) => [g.whiteId, g.blackId]));

  const mine = newcomer?.rating ?? 1200;
  const eligible = candidates
    .filter((c) => active.has(c.userId))
    .map((c) => {
      const theirs = c.user.glyphRatings.find((r) => r.category === "RAPID")?.rating ?? 1200;
      const gap = Math.abs(theirs - mine);
      const helper = c.role === "ORGANIZER" || c.role === "COACH" ? 0 : 1;
      return { userId: c.userId, gap, helper };
    })
    // Within the band first; a 2200 hosting a 900 is not a peer.
    .filter((c) => c.gap <= RATING_BAND)
    .sort((a, b) => a.helper - b.helper || a.gap - b.gap);

  // No active, in-band member: skip silently. Better than a host who
  // never appears.
  return eligible[0]?.userId ?? null;
}

/**
 * Everything that happens when someone joins.
 *
 * Deliberately tolerant: a failure here must never make the join
 * itself fail. Being in the club is the thing that matters; the
 * welcome is best-effort around it.
 */
export async function onJoinClub(clubId: string, userId: string) {
  try {
    const [club, profile, existing] = await Promise.all([
      prisma.club.findUnique({ where: { id: clubId }, select: { name: true, slug: true } }),
      prisma.profile.findUnique({ where: { userId }, select: { fullName: true, handle: true } }),
      prisma.post.findFirst({ where: { clubId, type: "WELCOME", subjectUserId: userId } }),
    ]);
    if (!club || existing) return;   // rejoining does not re-announce you

    const name = profile?.fullName ?? profile?.handle ?? "A new member";

    // The post is authored by the newcomer so it sits in their own
    // activity too, but it is a WELCOME, so the feed renders it as an
    // arrival rather than as something they said.
    await prisma.post.create({
      data: {
        clubId,
        authorId: userId,
        subjectUserId: userId,
        type: "WELCOME",
        body: `${name} joined ${club.name}.`,
      },
    });

    const hostId = await pickHost(clubId, userId);
    if (hostId) {
      await prisma.membership.updateMany({
        where: { clubId, userId },
        data: { hostFor: hostId },
      });
      await notify({
        userIds: [hostId],
        type: "CLUB_ANNOUNCEMENT",
        title: `You're hosting ${name} this week`,
        body: "Say hello, and play them a game.",
        linkUrl: `/club/${club.slug}`,
      });
    }

    // Organizers hear about it either way.
    const organisers = await prisma.membership.findMany({
      where: { clubId, active: true, role: { in: ["OWNER", "ADMIN", "ORGANIZER"] } },
      select: { userId: true },
    });
    if (organisers.length > 0) {
      await notify({
        userIds: organisers.map((o) => o.userId).filter((id) => id !== userId),
        type: "CLUB_ANNOUNCEMENT",
        title: `${name} joined ${club.name}`,
        linkUrl: `/club/${club.slug}`,
      });
    }
  } catch {
    // Never block the join.
  }
}

export interface FirstWeek {
  /** Days since joining; null once past the window. */
  day: number;
  pickedTimeControl: boolean;
  playedClubGame: boolean;
  metMembers: boolean;
  done: boolean;
  hostId: string | null;
}

/**
 * The newcomer's first-week state.
 *
 * Each step is inferred from something they actually did, not from a
 * checkbox they ticked — a checklist that can be satisfied by tapping
 * the checklist teaches nothing.
 */
export async function firstWeekFor(clubId: string, userId: string): Promise<FirstWeek | null> {
  const membership = await prisma.membership.findFirst({
    where: { clubId, userId, active: true },
    select: { joinedAt: true, hostFor: true, role: true },
  });
  if (!membership) return null;

  // Whoever created the club does not need telling to play their first
  // game in it. The checklist is for arrivals, not for the host.
  if (membership.role === "OWNER" || membership.role === "ADMIN") return null;

  const days = Math.floor((Date.now() - membership.joinedAt.getTime()) / 86_400_000);
  if (days >= HOST_DAYS) return null;

  const memberIds = (
    await prisma.membership.findMany({ where: { clubId, active: true }, select: { userId: true } })
  ).map((m) => m.userId);

  const [ratings, clubGames, follows] = await Promise.all([
    prisma.glyphRating.count({ where: { userId, games: { gt: 0 } } }),
    prisma.liveGame.count({
      where: {
        OR: [
          { whiteId: userId, blackId: { in: memberIds } },
          { blackId: userId, whiteId: { in: memberIds } },
        ],
      },
    }),
    prisma.follow.count({ where: { followerId: userId, followingId: { in: memberIds } } }),
  ]);

  const pickedTimeControl = ratings > 0 || clubGames > 0;
  const playedClubGame = clubGames > 0;
  const metMembers = follows >= 3;

  return {
    day: days + 1,
    pickedTimeControl,
    playedClubGame,
    metMembers,
    done: pickedTimeControl && playedClubGame && metMembers,
    hostId: membership.hostFor,
  };
}

/** How many newcomers this person has greeted. Recognition, counted honestly. */
export async function welcomesGiven(userId: string): Promise<number> {
  return prisma.reaction.count({ where: { userId, kind: "WELCOME" } });
}
