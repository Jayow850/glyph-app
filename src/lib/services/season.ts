import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notifications";
import type { SeasonHalf } from "@prisma/client";

/**
 * The club season.
 *
 * Clubs do not run events; they run a season with an arc and a
 * champion at the end. It opens around September, splits at Christmas,
 * closes in May at the AGM, and the Club Champion is decided by a
 * play-off between the winner of each half. Every club night,
 * tournament, league game and ladder result reports into it.
 *
 * Nothing here stores an aggregate. A member's record, performance and
 * attendance are computed from the games themselves, because a stored
 * total and the games it summarises drift apart the first time a
 * result is corrected — and then the league table contradicts the game
 * history in public, which is worse than being slow.
 */

/** Which half of the season a moment falls in. */
export function halfAt(season: { halfwayAt: Date }, when: Date = new Date()): SeasonHalf {
  return when.getTime() < season.halfwayAt.getTime() ? "AUTUMN" : "SPRING";
}

/** The club's running season, if it has one. */
export async function currentSeason(clubId: string) {
  return prisma.season.findFirst({
    where: { clubId, status: "ACTIVE" },
    orderBy: { startsAt: "desc" },
  });
}

/**
 * Open a season. A club runs one at a time, so opening a new one
 * closes whatever was running.
 */
export async function openSeason(
  clubId: string,
  input: { name: string; startsAt: Date; halfwayAt: Date; endsAt: Date },
) {
  if (!(input.startsAt < input.halfwayAt && input.halfwayAt < input.endsAt)) {
    throw new Error("season_dates_out_of_order");
  }

  await prisma.season.updateMany({
    where: { clubId, status: "ACTIVE" },
    data: { status: "COMPLETE", closedAt: new Date() },
  });

  return prisma.season.create({
    data: { clubId, ...input, status: "ACTIVE" },
  });
}

export interface SeasonRow {
  userId: string;
  name: string;
  country: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  /** Club nights checked in to — the number a secretary actually tracks. */
  attendance: number;
  /** Mean opponent rating plus the usual 400-per-unit-of-score swing. */
  performance: number | null;
}

/**
 * Every member's season, computed from the games.
 *
 * Counts anything played between members of the club inside the season
 * window: club nights, league fixtures, ladder games, casual games
 * between members. A club's season is everything that happened in it,
 * not only the fixtures someone remembered to register.
 */
export async function seasonTable(seasonId: string): Promise<SeasonRow[]> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { id: true, clubId: true, startsAt: true, endsAt: true },
  });
  if (!season) return [];

  const members = await prisma.membership.findMany({
    where: { clubId: season.clubId, active: true },
    include: { user: { include: { profile: true, glyphRatings: true } } },
  });
  const ids = members.map((m) => m.userId);
  if (ids.length === 0) return [];

  const [games, attendance] = await Promise.all([
    prisma.liveGame.findMany({
      where: {
        status: "FINISHED",
        result: { not: null },
        whiteId: { in: ids },
        blackId: { in: ids },
        updatedAt: { gte: season.startsAt, lte: season.endsAt },
      },
      select: {
        whiteId: true, blackId: true, result: true,
        whiteRatingBefore: true, blackRatingBefore: true,
      },
    }),
    prisma.clubNightRsvp.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, checkedInAt: { not: null }, clubNight: { seasonId } },
      _count: { _all: true },
    }),
  ]);

  const attended = new Map(attendance.map((a) => [a.userId, a._count._all]));
  const blank = () => ({ played: 0, wins: 0, draws: 0, losses: 0, points: 0, oppSum: 0, oppCount: 0 });
  const acc = new Map(ids.map((id) => [id, blank()]));

  for (const g of games) {
    const w = acc.get(g.whiteId);
    const b = acc.get(g.blackId);
    if (!w || !b) continue;

    const whiteScore = g.result === "1-0" ? 1 : g.result === "0-1" ? 0 : 0.5;
    for (const [me, them, score, theirRating] of [
      [w, b, whiteScore, g.blackRatingBefore],
      [b, w, 1 - whiteScore, g.whiteRatingBefore],
    ] as const) {
      void them;
      me.played += 1;
      me.points += score;
      if (score === 1) me.wins += 1;
      else if (score === 0) me.losses += 1;
      else me.draws += 1;
      if (theirRating != null) { me.oppSum += theirRating; me.oppCount += 1; }
    }
  }

  return members
    .map((m) => {
      const a = acc.get(m.userId)!;
      // Performance rating, the standard approximation: average
      // opposition plus 400 x (score - half) / games.
      const performance =
        a.oppCount > 0
          ? Math.round(a.oppSum / a.oppCount + (400 * (a.points - a.played / 2)) / a.played)
          : null;
      return {
        userId: m.userId,
        name: m.user.profile?.fullName ?? "A member",
        country: m.user.profile?.country ?? null,
        played: a.played,
        wins: a.wins,
        draws: a.draws,
        losses: a.losses,
        points: a.points,
        attendance: attended.get(m.userId) ?? 0,
        performance,
      };
    })
    .sort((x, y) => y.points - x.points || y.played - x.played || x.name.localeCompare(y.name));
}

/**
 * Who won a half.
 *
 * The top division decides it where a club runs divisions, because
 * that is what "club champion" means — you cannot win the title from
 * the third division. A club with no divisions falls back to the
 * season table.
 */
export async function halfWinner(seasonId: string, half: SeasonHalf): Promise<string | null> {
  const top = await prisma.division.findFirst({
    where: { seasonId, half, tier: 0 },
    select: { id: true },
  });

  if (top) {
    const { leagueTable } = await import("./league");
    const table = await leagueTable(top.id);
    return table[0]?.userId ?? null;
  }

  const table = await seasonTable(seasonId);
  return table.find((r) => r.played > 0)?.userId ?? null;
}

/**
 * Set up the championship once both halves have a winner.
 *
 * Same player both halves and they are champion outright — there is
 * nobody to play. Otherwise two games with colours reversed.
 */
export async function openChampionship(seasonId: string) {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { club: true, championship: true },
  });
  if (!season) return null;
  if (season.championship?.decidedAt) return season.championship;

  const [autumn, spring] = await Promise.all([
    halfWinner(seasonId, "AUTUMN"),
    halfWinner(seasonId, "SPRING"),
  ]);
  if (!autumn || !spring) return null;

  const outright = autumn === spring;

  const championship = await prisma.championship.upsert({
    where: { seasonId },
    create: {
      seasonId,
      autumnWinnerId: autumn,
      springWinnerId: spring,
      outright,
      championId: outright ? autumn : null,
      decidedAt: outright ? new Date() : null,
      decidedBy: outright ? "Won both halves outright." : null,
    },
    update: { autumnWinnerId: autumn, springWinnerId: spring, outright },
  });

  const who = [...new Set([autumn, spring])];
  await notify({
    userIds: who,
    type: "CLUB_ANNOUNCEMENT",
    title: outright ? "You are club champion" : "You are in the championship play-off",
    body: outright
      ? "You won both halves of the season."
      : "Two games, colours reversed, for the club title.",
    linkUrl: `/club/${season.club.slug}`,
  });

  return championship;
}

/**
 * Settle a play-off that is level after both games.
 *
 * Documented rather than invented, and written down on the honours
 * post so it can be shown to anyone who disagrees. Armageddon is
 * overkill for a club, so: head-to-head across the whole season, then
 * season score percentage, then the higher rating at season start.
 */
export async function decidePlayoff(
  seasonId: string,
  a: string,
  b: string,
): Promise<{ championId: string; decidedBy: string } | null> {
  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season) return null;

  const meetings = await prisma.liveGame.findMany({
    where: {
      status: "FINISHED",
      result: { not: null },
      updatedAt: { gte: season.startsAt, lte: season.endsAt },
      OR: [
        { whiteId: a, blackId: b },
        { whiteId: b, blackId: a },
      ],
    },
    select: { whiteId: true, result: true },
  });

  let aScore = 0;
  for (const g of meetings) {
    const whitePts = g.result === "1-0" ? 1 : g.result === "0-1" ? 0 : 0.5;
    aScore += g.whiteId === a ? whitePts : 1 - whitePts;
  }
  const half = meetings.length / 2;
  if (meetings.length > 0 && aScore !== half) {
    return {
      championId: aScore > half ? a : b,
      decidedBy: `Head-to-head across the season: ${aScore}–${meetings.length - aScore}.`,
    };
  }

  const table = await seasonTable(seasonId);
  const rowA = table.find((r) => r.userId === a);
  const rowB = table.find((r) => r.userId === b);
  const pct = (r?: SeasonRow) => (r && r.played > 0 ? r.points / r.played : 0);
  if (pct(rowA) !== pct(rowB)) {
    return {
      championId: pct(rowA) > pct(rowB) ? a : b,
      decidedBy: `Season score percentage: ${(pct(rowA) * 100).toFixed(1)}% to ${(pct(rowB) * 100).toFixed(1)}%.`,
    };
  }

  const ratings = await prisma.glyphRating.findMany({
    where: { userId: { in: [a, b] }, category: "RAPID" },
    select: { userId: true, rating: true },
  });
  const rA = ratings.find((r) => r.userId === a)?.rating ?? 0;
  const rB = ratings.find((r) => r.userId === b)?.rating ?? 0;
  return {
    championId: rA >= rB ? a : b,
    decidedBy: `Level on every tie-break; decided on rating (${Math.round(rA)} to ${Math.round(rB)}).`,
  };
}

/**
 * The honours, computed without writing anything.
 *
 * Closing a season is irreversible and it is the club's history being
 * written, so the organiser reads this first and confirms it.
 */
export async function previewHonours(seasonId: string): Promise<string[] | null> {
  const built = await buildHonours(seasonId);
  if (!built) return null;

  // Name the trophies that would be engraved, without engraving them.
  const pending = await prisma.trophy.findMany({
    where: {
      clubId: built.season.clubId,
      awardedFor: { not: "MANUAL" },
      awards: { none: { seasonId } },
    },
    select: { name: true, awardedFor: true },
  });

  const willAward = pending
    .filter((t) =>
      t.awardedFor === "SEASON_CHAMPION" ? built.decided.championId
      : t.awardedFor === "DIVISION_WINNER" ? built.decided.divisionWinners.length > 0
      : t.awardedFor === "MOST_IMPROVED" ? built.decided.mostImprovedId
      : t.awardedFor === "BEST_ATTENDANCE" ? built.decided.bestAttendanceId
      : false,
    )
    .map((t) => `The ${t.name} will be awarded.`);

  return [...built.lines, ...willAward];
}

async function buildHonours(seasonId: string) {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { club: true, championship: true, divisions: { include: { members: true } } },
  });
  if (!season) return null;

  const table = await seasonTable(seasonId);
  const played = table.filter((r) => r.played > 0);

  const champion = season.championship?.championId ?? null;
  const nameOf = (id: string | null) =>
    id ? (table.find((r) => r.userId === id)?.name ?? "A member") : null;

  const bestAttendance = [...played].sort((a, b) => b.attendance - a.attendance)[0];

  // Most improved, measured honestly: rating now against rating at the
  // first game of the season, not against a guess.
  const improvement = await mostImproved(seasonId, played.map((p) => p.userId));

  const divisionWinners: string[] = [];
  // Kept as ids too: the honours post needs names, the trophy cabinet
  // needs who to engrave.
  const divisionWinnerIds: { divisionName: string; userId: string }[] = [];
  for (const d of season.divisions) {
    const winner = d.members.find((m) => m.finalRank === 1);
    if (winner) {
      divisionWinners.push(`${d.name}: ${nameOf(winner.userId) ?? "—"}`);
      divisionWinnerIds.push({ divisionName: d.name, userId: winner.userId });
    }
  }

  const lines = [
    `${season.name} is over. ${played.length} members played.`,
    champion ? `Club Champion: ${nameOf(champion)}.` : null,
    season.championship?.decidedBy ?? null,
    ...divisionWinners,
    improvement ? `Most improved: ${improvement.name}, up ${improvement.gain} points.` : null,
    bestAttendance && bestAttendance.attendance > 0
      ? `Best attendance: ${bestAttendance.name}, ${bestAttendance.attendance} club nights.`
      : null,
  ].filter(Boolean) as string[];

  return {
    season, lines, champion, nameOf, played,
    decided: {
      championId: champion,
      divisionWinners: divisionWinnerIds,
      mostImprovedId: improvement?.userId ?? null,
      bestAttendanceId:
        bestAttendance && bestAttendance.attendance > 0 ? bestAttendance.userId : null,
    },
  };
}

/**
 * The closing ceremony.
 *
 * Writes the honours into club history permanently, as a pinned post.
 * A club's history is its greatest asset and every app throws it away.
 */
export async function closeSeason(seasonId: string) {
  const built = await buildHonours(seasonId);
  if (!built || built.season.status === "COMPLETE") return null;
  const { season, champion, nameOf, played, decided } = built;

  // The silverware is part of the ceremony, not an afterthought somebody
  // has to remember. Awarding happens before the post is written so the
  // trophies appear in it.
  const { awardSeasonTrophies } = await import("./trophies");
  const trophyLines = await awardSeasonTrophies(seasonId, decided).catch(() => [] as string[]);
  const lines = trophyLines.length > 0 ? [...built.lines, ...trophyLines] : built.lines;

  const owner = await prisma.membership.findFirst({
    where: { clubId: season.clubId, role: "OWNER", active: true },
    select: { userId: true },
  });

  if (owner) {
    await prisma.post.create({
      data: {
        clubId: season.clubId,
        authorId: owner.userId,
        type: "MILESTONE",
        body: lines.join("\n"),
        // Pinned, because this is the thing a club looks back at.
        pinned: true,
      },
    });
  }

  await prisma.season.update({
    where: { id: seasonId },
    data: { status: "COMPLETE", closedAt: new Date(), championId: champion },
  });

  if (played.length > 0) {
    await notify({
      userIds: played.map((p) => p.userId),
      type: "CLUB_ANNOUNCEMENT",
      title: `${season.name} is complete`,
      body: champion ? `${nameOf(champion)} is club champion.` : undefined,
      linkUrl: `/club/${season.club.slug}`,
    });
  }

  return { honours: lines };
}

/** Biggest rating gain across the season, from the rating history. */
async function mostImproved(seasonId: string, userIds: string[]) {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { startsAt: true, endsAt: true },
  });
  if (!season || userIds.length === 0) return null;

  const history = await prisma.glyphRatingHistory.findMany({
    where: {
      createdAt: { gte: season.startsAt, lte: season.endsAt },
      glyphRating: { userId: { in: userIds }, category: "RAPID" },
    },
    orderBy: { createdAt: "asc" },
    include: { glyphRating: { include: { user: { include: { profile: true } } } } },
  });

  const first = new Map<string, number>();
  const last = new Map<string, number>();
  const names = new Map<string, string>();
  for (const h of history) {
    const uid = h.glyphRating.userId;
    if (!first.has(uid)) first.set(uid, h.before);
    last.set(uid, h.after);
    names.set(uid, h.glyphRating.user.profile?.fullName ?? "A member");
  }

  // The id travels with the name: the honours post needs one, the
  // trophy needs the other.
  let best: { userId: string; name: string; gain: number } | null = null;
  for (const [uid, start] of first) {
    const gain = Math.round((last.get(uid) ?? start) - start);
    if (gain > 0 && (!best || gain > best.gain)) {
      best = { userId: uid, name: names.get(uid) ?? "A member", gain };
    }
  }
  return best;
}
