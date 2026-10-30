import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { canRunCompetitions, canAwardHonours } from "@/lib/services/officers";

/**
 * Everything the club shell and every tab under it need to know.
 *
 * The club page used to be one route that loaded all fifteen of its
 * sections before rendering any of them. Split into tabs, the header
 * and the open tab would each repeat the same club and membership
 * lookups, so this is wrapped in React's `cache`: called any number of
 * times inside one render pass, it queries once.
 *
 * It deliberately loads only what the shell needs. The heavy per-tab
 * work — league tables, rolls of honour, member lists — stays in the
 * tab that shows it, so a slow query on one tab cannot delay another.
 */

/** A member is "here now" if they were seen within this window. */
export const ONLINE_MS = 3 * 60 * 1000;

/**
 * Anyone whose membership predates this is a founding member.
 *
 * A club and its first roster are written in one transaction, so their
 * joinedAt values land milliseconds apart. Two minutes is far wider
 * than that gap and far narrower than a real person joining later.
 */
export const FOUNDING_MS = 2 * 60 * 1000;

export const clubContext = cache(async (slug: string, userId: string | null) => {
  const club = await prisma.club.findUnique({
    where: { slug },
    include: { _count: { select: { memberships: { where: { active: true } } } } },
  });
  if (!club) return null;

  const since = new Date(Date.now() - ONLINE_MS);

  const [membership, onlineCount, liveCount] = await Promise.all([
    userId
      ? prisma.membership.findFirst({
          where: { userId, clubId: club.id, active: true },
          select: { role: true, joinedAt: true },
        })
      : Promise.resolve(null),
    prisma.membership.count({
      where: {
        clubId: club.id,
        active: true,
        user: { profile: { lastSeenAt: { gte: since } } },
      },
    }),
    // A game is live once a move has been played on it. `status:
    // ACTIVE` alone counts boards created and never touched.
    prisma.liveGame.count({
      where: {
        status: "ACTIVE",
        sans: { isEmpty: false },
        white: { memberships: { some: { clubId: club.id, active: true } } },
        black: { memberships: { some: { clubId: club.id, active: true } } },
      },
    }),
  ]);

  return {
    club,
    membership,
    isMember: Boolean(membership),
    organiser: canRunCompetitions(membership?.role),
    canAward: canAwardHonours(membership?.role),
    onlineCount,
    liveCount,
  };
});

export type ClubContext = NonNullable<Awaited<ReturnType<typeof clubContext>>>;

/**
 * What is waiting on this member, as numbers for the tab badges.
 *
 * A badge is a promise that something needs doing, so each of these
 * counts an action the member can actually take right now — not news,
 * not things merely of interest.
 */
export const clubBadges = cache(async (clubId: string, userId: string | null, organiser: boolean) => {
  if (!userId) return { now: 0, season: 0, play: 0 };

  const [challenges, owed, unwelcomed] = await Promise.all([
    // A challenge waiting on my answer, or a game agreed and unreported.
    prisma.ladderChallenge.count({
      where: {
        clubId,
        OR: [
          { defenderId: userId, state: "OPEN" },
          { state: "ACCEPTED", OR: [{ defenderId: userId }, { challengerId: userId }] },
        ],
      },
    }),
    prisma.leagueFixture.count({
      where: {
        state: "SCHEDULED",
        OR: [{ whiteId: userId }, { blackId: userId }],
        division: { season: { clubId, status: "ACTIVE" } },
      },
    }),
    organiser
      ? prisma.membership.count({
          where: {
            clubId,
            active: true,
            role: { notIn: ["OWNER", "PRESIDENT"] },
            joinedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
          },
        })
      : Promise.resolve(0),
  ]);

  return {
    now: challenges + owed + unwelcomed,
    season: owed,
    play: challenges,
  };
});
