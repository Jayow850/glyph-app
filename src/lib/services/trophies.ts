import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notifications";
import type { TrophyKind } from "@prisma/client";

/**
 * Named trophies, and the roll of honour behind them.
 *
 * A club's silverware is the part of it that outlives everybody. The
 * Cookworthy Cup means something because there is a list of names on it
 * going back further than anyone present can remember, and a player who
 * wins it joins that list. A "tournament winner" badge is forgotten by
 * Friday because it joins nothing.
 *
 * Two consequences run through this file.
 *
 * A winner is not necessarily a user. A club arriving with fifty years
 * of history has fifty winners and perhaps five accounts; most of the
 * names on the cup belong to people who will never sign up, and some to
 * people who are dead. So an award carries either a userId or a plain
 * engraved name, and the roll of honour renders both the same way.
 *
 * And the year is a string. Clubs write "1987-88", not a timestamp.
 * Storing it as written is what lets a secretary type the cup in exactly
 * as it reads, which is the only way this gets done in one sitting.
 */

export const TROPHY_KIND_LABEL: Record<TrophyKind, string> = {
  SEASON_CHAMPION: "Club champion",
  DIVISION_WINNER: "Division winner",
  LADDER_CHAMPION: "Ladder champion",
  BEST_ATTENDANCE: "Best attendance",
  MOST_IMPROVED: "Most improved",
  MANUAL: "Awarded by the officers",
};

export interface Winner {
  id: string;
  year: string;
  /** Present when the winner has an account. */
  userId: string | null;
  handle: string | null;
  country: string | null;
  /** Always set — the account's name, or the engraved one. */
  name: string;
  note: string | null;
  /** True when this came from a season GLYPH actually ran. */
  onGlyph: boolean;
}

export interface TrophyView {
  id: string;
  name: string;
  description: string | null;
  namedAfter: string | null;
  awardedFor: TrophyKind;
  /** Most recent winner, by year. */
  holder: Winner | null;
  awardCount: number;
  /** The earliest year on the cup, which is the number people quote. */
  since: string | null;
}

/** One trophy with every name on it, oldest first. */
export interface RollView {
  id: string;
  name: string;
  description: string | null;
  namedAfter: string | null;
  awardedFor: TrophyKind;
  clubSlug: string;
  clubName: string;
  winners: Winner[];
}

/** Years are strings as engraved; "1987-88" sorts before "1990" on its first number. */
function yearKey(y: string): number {
  const m = /\d{4}/.exec(y);
  return m ? Number(m[0]) : 0;
}

function toWinner(a: {
  id: string; year: string; note: string | null; seasonId: string | null;
  winnerName: string | null; userId: string | null;
  user: { profile: { fullName: string; handle: string; country: string | null } | null } | null;
}): Winner {
  return {
    id: a.id,
    year: a.year,
    userId: a.userId,
    handle: a.user?.profile?.handle ?? null,
    country: a.user?.profile?.country ?? null,
    name: a.user?.profile?.fullName ?? a.winnerName ?? "—",
    note: a.note,
    onGlyph: a.seasonId !== null,
  };
}

const AWARD_SELECT = {
  id: true, year: true, note: true, seasonId: true, winnerName: true, userId: true,
  user: { select: { profile: { select: { fullName: true, handle: true, country: true } } } },
} as const;

/** The cabinet: every trophy a club has, with who holds it now. */
export async function trophyCabinet(clubId: string): Promise<TrophyView[]> {
  const trophies = await prisma.trophy.findMany({
    where: { clubId },
    include: { awards: { select: AWARD_SELECT } },
    orderBy: { createdAt: "asc" },
  });

  return trophies.map((t) => {
    const sorted = [...t.awards].sort((a, b) => yearKey(b.year) - yearKey(a.year));
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      namedAfter: t.namedAfter,
      awardedFor: t.awardedFor,
      holder: sorted[0] ? toWinner(sorted[0]) : null,
      awardCount: t.awards.length,
      since: sorted.length ? sorted[sorted.length - 1].year : null,
    };
  });
}

/** One trophy and every name on it, oldest first. */
export async function rollOfHonour(trophyId: string): Promise<RollView | null> {
  const trophy = await prisma.trophy.findUnique({
    where: { id: trophyId },
    include: { club: { select: { slug: true, name: true } }, awards: { select: AWARD_SELECT } },
  });
  if (!trophy) return null;

  const winners = [...trophy.awards]
    .map(toWinner)
    .sort((a, b) => yearKey(a.year) - yearKey(b.year) || a.year.localeCompare(b.year));

  return {
    id: trophy.id,
    name: trophy.name,
    description: trophy.description,
    namedAfter: trophy.namedAfter,
    awardedFor: trophy.awardedFor,
    clubSlug: trophy.club.slug,
    clubName: trophy.club.name,
    winners,
  };
}

export async function createTrophy(
  clubId: string,
  input: { name: string; description?: string; namedAfter?: string; awardedFor?: TrophyKind },
) {
  return prisma.trophy.create({
    data: {
      clubId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      namedAfter: input.namedAfter?.trim() || null,
      awardedFor: input.awardedFor ?? "MANUAL",
    },
  });
}

/**
 * Put a name on a trophy.
 *
 * Used both for this year's winner and for the 1974 one. The only
 * difference is whether a userId comes with it.
 */
export async function awardTrophy(
  trophyId: string,
  input: {
    year: string;
    userId?: string | null;
    winnerName?: string | null;
    seasonId?: string | null;
    note?: string | null;
    /** Announce it. Off for backfill — nobody wants fifty notifications. */
    announce?: boolean;
  },
) {
  if (!input.userId && !input.winnerName?.trim()) throw new Error("winner_required");

  const award = await prisma.trophyAward.create({
    data: {
      trophyId,
      year: input.year.trim(),
      userId: input.userId ?? null,
      winnerName: input.userId ? null : input.winnerName!.trim(),
      seasonId: input.seasonId ?? null,
      note: input.note?.trim() || null,
    },
  });

  if (input.announce && input.userId) {
    const trophy = await prisma.trophy.findUnique({
      where: { id: trophyId },
      include: { club: { select: { slug: true, name: true } } },
    });
    if (trophy) {
      await postToFeed(trophy.clubId, input.userId, trophy.name, input.year);
      await notify({
        userIds: [input.userId],
        type: "CLUB_ANNOUNCEMENT",
        title: `You have won the ${trophy.name}`,
        body: `${trophy.name}, ${input.year}. Your name is on it now.`,
        linkUrl: `/club/${trophy.club.slug}/trophies/${trophyId}`,
      });
    }
  }

  return award;
}

/** Winning silverware is club news, so it goes in the feed by itself. */
async function postToFeed(clubId: string, userId: string, trophyName: string, year: string) {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { fullName: true },
  });
  const owner = await prisma.membership.findFirst({
    where: { clubId, role: "OWNER", active: true },
    select: { userId: true },
  });
  if (!owner) return;

  await prisma.post.create({
    data: {
      clubId,
      authorId: owner.userId,
      type: "MILESTONE",
      subjectUserId: userId,
      body: `${profile?.fullName ?? "A member"} wins the ${trophyName}, ${year}.`,
    },
  });
}

/**
 * Award everything the season already decided.
 *
 * Called from closeSeason, so the ceremony is one action: the honours
 * post and the silverware happen together, and nobody has to remember
 * to go and award the cup afterwards. A trophy already awarded for this
 * season is left alone, so closing twice cannot double-engrave it.
 */
export async function awardSeasonTrophies(
  seasonId: string,
  decided: {
    championId: string | null;
    divisionWinners: { divisionName: string; userId: string }[];
    mostImprovedId: string | null;
    bestAttendanceId: string | null;
  },
): Promise<string[]> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { id: true, clubId: true, name: true },
  });
  if (!season) return [];

  const trophies = await prisma.trophy.findMany({
    where: { clubId: season.clubId, awardedFor: { not: "MANUAL" } },
    include: { awards: { where: { seasonId }, select: { id: true } } },
  });

  const lines: string[] = [];

  for (const trophy of trophies) {
    if (trophy.awards.length > 0) continue; // already engraved for this season

    const winners: { userId: string; note?: string }[] = [];
    switch (trophy.awardedFor) {
      case "SEASON_CHAMPION":
        if (decided.championId) winners.push({ userId: decided.championId });
        break;
      case "DIVISION_WINNER":
        for (const d of decided.divisionWinners) {
          winners.push({ userId: d.userId, note: d.divisionName });
        }
        break;
      case "MOST_IMPROVED":
        if (decided.mostImprovedId) winners.push({ userId: decided.mostImprovedId });
        break;
      case "BEST_ATTENDANCE":
        if (decided.bestAttendanceId) winners.push({ userId: decided.bestAttendanceId });
        break;
      default:
        break; // LADDER_CHAMPION is awarded when the ladder closes, not here
    }

    for (const w of winners) {
      await awardTrophy(trophy.id, {
        year: season.name,
        userId: w.userId,
        seasonId,
        note: w.note ?? null,
        announce: true,
      });
      const profile = await prisma.profile.findUnique({
        where: { userId: w.userId },
        select: { fullName: true },
      });
      lines.push(
        `${trophy.name}: ${profile?.fullName ?? "A member"}${w.note ? ` (${w.note})` : ""}.`,
      );
    }
  }

  return lines;
}

/** The shelf on somebody's profile. */
export async function trophiesFor(userId: string) {
  const awards = await prisma.trophyAward.findMany({
    where: { userId },
    select: {
      id: true,
      trophyId: true,
      year: true,
      note: true,
      trophy: { select: { name: true, club: { select: { slug: true, name: true } } } },
    },
  });

  return awards
    .map((a) => ({
      awardId: a.id,
      trophyId: a.trophyId,
      trophyName: a.trophy.name,
      clubSlug: a.trophy.club.slug,
      clubName: a.trophy.club.name,
      year: a.year,
      note: a.note,
    }))
    .sort((x, y) => yearKey(y.year) - yearKey(x.year));
}
