import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notifications";
import { computeStandings, type PlayerResultRow } from "@engine/pairing/tiebreaks";
import type { SeasonHalf } from "@prisma/client";

/**
 * The internal club league, with promotion and relegation.
 *
 * This is the heart of club chess and no online platform models it.
 * A club runs one to four graded divisions over each half-season; each
 * is an all-play-all; the bottom of one division goes down and the top
 * of the next goes up. That movement is the whole season's tension.
 *
 * Two things here are deliberate and worth defending:
 *
 * Divisions are NAMED, not numbered. Real clubs name them after
 * members who served the club — the Homan League, the Dunleavy League.
 * `tier` carries the ordering so promotion still works; the name
 * carries the history.
 *
 * Fixtures are ARRANGED, not paired. A league is not a Swiss. Members
 * see who they still owe a game to and arrange it between themselves a
 * week ahead, which is exactly how club league chess runs. Putting it
 * through pairNextRound would be modelling a tournament and calling it
 * a league.
 */

/** Nudge a player this long before a fixture is due. */
const NUDGE_DAYS = 10;

export async function createDivision(
  seasonId: string,
  input: {
    half: SeasonHalf;
    name: string;
    tier: number;
    promoteCount?: number;
    relegateCount?: number;
  },
) {
  return prisma.division.create({
    data: {
      seasonId,
      half: input.half,
      name: input.name.trim(),
      tier: input.tier,
      promoteCount: input.promoteCount ?? 2,
      relegateCount: input.relegateCount ?? 2,
    },
  });
}

/**
 * Put a member in a division.
 *
 * At the organiser's discretion, as club secretaries actually do it —
 * they know who has improved and who has not played since March, and
 * no rating formula knows that.
 */
export async function allocate(divisionId: string, userId: string) {
  const division = await prisma.division.findUnique({
    where: { id: divisionId },
    select: { id: true, seasonId: true, half: true },
  });
  if (!division) throw new Error("no_such_division");

  // One division per member per half: moving them removes the old place.
  const siblings = await prisma.division.findMany({
    where: { seasonId: division.seasonId, half: division.half },
    select: { id: true },
  });
  await prisma.divisionMember.deleteMany({
    where: { userId, divisionId: { in: siblings.map((s) => s.id) } },
  });

  return prisma.divisionMember.create({ data: { divisionId, userId } });
}

/**
 * Create every fixture in an all-play-all.
 *
 * Colours alternate around a circle so nobody ends up with white four
 * times running — the standard round-robin rotation, applied once up
 * front rather than round by round, because league fixtures are played
 * in whatever order the players manage to arrange them.
 */
export async function generateFixtures(divisionId: string, dueBy?: Date) {
  const division = await prisma.division.findUnique({
    where: { id: divisionId },
    include: { members: true, fixtures: { select: { id: true } } },
  });
  if (!division) throw new Error("no_such_division");
  if (division.fixtures.length > 0) return { created: 0, already: division.fixtures.length };

  const ids = division.members.map((m) => m.userId);
  if (ids.length < 2) throw new Error("not_enough_members");

  const rows: { divisionId: string; whiteId: string; blackId: string; dueBy?: Date }[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      // (i + j) alternates the colour as you move along the grid, which
      // gives every player a near-even split of white and black.
      const whiteFirst = (i + j) % 2 === 0;
      rows.push({
        divisionId,
        whiteId: whiteFirst ? ids[i] : ids[j],
        blackId: whiteFirst ? ids[j] : ids[i],
        dueBy,
      });
    }
  }

  await prisma.leagueFixture.createMany({ data: rows, skipDuplicates: true });
  return { created: rows.length, already: 0 };
}

export interface LeagueRow {
  userId: string;
  name: string;
  handle: string | null;
  country: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  /** Sonneborn–Berger (Neustadtl), the real club tie-break. */
  sb: number;
  /** Direct encounter within the group tied on points. */
  direct: number;
  remaining: number;
  rank: number;
}

/**
 * The table.
 *
 * Tie-break is Sonneborn–Berger with direct encounter secondary, which
 * is the rule actual clubs use. `computeStandings` in the pairing
 * engine already implements both correctly, including resolving direct
 * encounter only within a tied group — so this converts fixtures into
 * the shape it wants rather than reimplementing any of it.
 */
export async function leagueTable(divisionId: string): Promise<LeagueRow[]> {
  const division = await prisma.division.findUnique({
    where: { id: divisionId },
    include: {
      members: { include: { user: { include: { profile: true } } } },
      fixtures: true,
    },
  });
  if (!division) return [];

  const rows: PlayerResultRow[] = division.members.map((m) => {
    const mine = division.fixtures.filter(
      (f) => (f.whiteId === m.userId || f.blackId === m.userId) && f.result,
    );
    return {
      userId: m.userId,
      score: mine.reduce((t, f) => t + pointsFor(m.userId, f), 0),
      rounds: mine.map((f) => ({
        opponentId: f.whiteId === m.userId ? f.blackId : f.whiteId,
        points: pointsFor(m.userId, f),
      })),
    };
  });

  const standings = computeStandings(rows, ["SONNEBORN_BERGER", "DIRECT_ENCOUNTER", "WINS"]);

  return standings.map((s) => {
    const member = division.members.find((m) => m.userId === s.userId)!;
    const mine = division.fixtures.filter((f) => f.whiteId === s.userId || f.blackId === s.userId);
    const decided = mine.filter((f) => f.result);
    return {
      userId: s.userId,
      name: member.user.profile?.fullName ?? "A member",
      handle: member.user.profile?.handle ?? null,
      country: member.user.profile?.country ?? null,
      played: decided.length,
      wins: decided.filter((f) => pointsFor(s.userId, f) === 1).length,
      draws: decided.filter((f) => pointsFor(s.userId, f) === 0.5).length,
      losses: decided.filter((f) => pointsFor(s.userId, f) === 0).length,
      points: s.score,
      sb: s.tiebreaks.SONNEBORN_BERGER,
      direct: s.tiebreaks.DIRECT_ENCOUNTER,
      remaining: mine.length - decided.length,
      rank: s.rank,
    };
  });
}

function pointsFor(userId: string, f: { whiteId: string; result: string | null }): number {
  if (!f.result) return 0;
  const white = f.result === "1-0" ? 1 : f.result === "0-1" ? 0 : 0.5;
  return f.whiteId === userId ? white : 1 - white;
}

/** Who you still owe a game to, which is the only list a member needs. */
export async function gamesOwed(divisionId: string, userId: string) {
  const fixtures = await prisma.leagueFixture.findMany({
    where: {
      divisionId,
      state: { in: ["SCHEDULED", "ARRANGED"] },
      OR: [{ whiteId: userId }, { blackId: userId }],
    },
    include: {
      white: { include: { profile: true } },
      black: { include: { profile: true } },
    },
    orderBy: { dueBy: "asc" },
  });

  return fixtures.map((f) => {
    const opponent = f.whiteId === userId ? f.black : f.white;
    return {
      fixtureId: f.id,
      opponentId: opponent.id,
      opponentName: opponent.profile?.fullName ?? "A member",
      opponentCountry: opponent.profile?.country ?? null,
      /** Your colour, which decides who sets the board up. */
      colour: f.whiteId === userId ? ("white" as const) : ("black" as const),
      state: f.state,
      dueBy: f.dueBy,
      arrangedAt: f.arrangedAt,
    };
  });
}

/** Mark a fixture as arranged, so both players know it is in the diary. */
export async function arrangeFixture(fixtureId: string, when: Date | null) {
  return prisma.leagueFixture.update({
    where: { id: fixtureId },
    data: { state: "ARRANGED", arrangedAt: when ?? new Date() },
  });
}

/**
 * Record a league result from a finished game.
 *
 * Called from settleIfFinished alongside the rating and the wallchart,
 * so a league game needs no separate "submit result" step — playing it
 * on GLYPH is submitting it.
 */
export async function settleLeagueFixture(liveGameId: string) {
  const fixture = await prisma.leagueFixture.findUnique({
    where: { liveGameId },
    include: { division: { include: { season: { include: { club: true } } } } },
  });
  if (!fixture || fixture.result) return null;

  const game = await prisma.liveGame.findUnique({
    where: { id: liveGameId },
    select: { status: true, result: true },
  });
  if (!game || game.status !== "FINISHED" || !game.result) return null;

  await prisma.leagueFixture.update({
    where: { id: fixture.id },
    data: { result: game.result, state: "PLAYED", playedAt: new Date() },
  });

  await notify({
    userIds: [fixture.whiteId, fixture.blackId],
    type: "RESULT",
    title: `${fixture.division.name} result recorded`,
    linkUrl: `/club/${fixture.division.season.club.slug}`,
  });

  return { fixtureId: fixture.id, result: game.result };
}

/** Attach a game to a fixture when two players start their league game. */
export async function bindFixtureToGame(fixtureId: string, liveGameId: string) {
  return prisma.leagueFixture.update({
    where: { id: fixtureId },
    data: { liveGameId, state: "LIVE", arrangedAt: new Date() },
  });
}

export interface MovementRow {
  userId: string;
  name: string;
  rank: number;
  played: number;
  points: number;
  /** The division they are moving to. */
  to: string;
}

export interface DivisionMovement {
  divisionId: string;
  name: string;
  /** Fixtures in this division still unplayed when the half was closed. */
  unplayed: number;
  promoted: MovementRow[];
  relegated: MovementRow[];
  finalRanks: { userId: string; name: string; rank: number }[];
}

/**
 * Work out who moves, without moving anybody.
 *
 * Relegation is socially charged — it is a conversation at the club on
 * Wednesday, not a database row. So the computation is separated from
 * the write, and the organiser sees exactly this before confirming.
 */
export async function computeMovement(
  seasonId: string,
  half: SeasonHalf,
): Promise<DivisionMovement[]> {
  const divisions = await prisma.division.findMany({
    where: { seasonId, half },
    orderBy: { tier: "asc" },
  });

  const out: DivisionMovement[] = [];

  for (const [index, division] of divisions.entries()) {
    const table = await leagueTable(division.id);
    const above = divisions[index - 1];
    const below = divisions[index + 1];

    const toRow = (r: (typeof table)[number], to: string): MovementRow => ({
      userId: r.userId, name: r.name, rank: r.rank, played: r.played, points: r.points, to,
    });

    out.push({
      divisionId: division.id,
      name: division.name,
      unplayed: table.reduce((t, r) => t + r.remaining, 0) / 2,
      promoted: above ? table.slice(0, division.promoteCount).map((r) => toRow(r, above.name)) : [],
      relegated: below ? table.slice(-division.relegateCount).map((r) => toRow(r, below.name)) : [],
      finalRanks: table.map((r) => ({ userId: r.userId, name: r.name, rank: r.rank })),
    });
  }

  return out;
}

/**
 * Promotion and relegation at the end of a half.
 *
 * Bottom N down, top N up, N set per division because a club with
 * twelve in the top division and five in the second does not want the
 * same number moving each way. The movement itself is computed by
 * computeMovement, so what the organiser confirmed is exactly what
 * runs.
 */
export async function applyPromotionRelegation(seasonId: string, half: SeasonHalf) {
  const divisions = await prisma.division.findMany({
    where: { seasonId, half },
    orderBy: { tier: "asc" },
    include: { season: { include: { club: true } } },
  });
  if (divisions.length === 0) return null;

  const movement = await computeMovement(seasonId, half);
  const moves: string[] = [];

  for (const m of movement) {
    // Final ranks are written even where nobody moves — the table is
    // the record of the half, and it has to survive the next one.
    for (const row of m.finalRanks) {
      await prisma.divisionMember.updateMany({
        where: { divisionId: m.divisionId, userId: row.userId },
        data: { finalRank: row.rank },
      });
    }

    for (const row of m.promoted) {
      await prisma.divisionMember.updateMany({
        where: { divisionId: m.divisionId, userId: row.userId },
        data: { promoted: true },
      });
      moves.push(`${row.name} goes up to the ${row.to}.`);
    }

    for (const row of m.relegated) {
      await prisma.divisionMember.updateMany({
        where: { divisionId: m.divisionId, userId: row.userId },
        data: { relegated: true },
      });
      moves.push(`${row.name} goes down to the ${row.to}.`);
    }
  }

  const club = divisions[0].season.club;

  if (moves.length > 0) {
    const owner = await prisma.membership.findFirst({
      where: { clubId: club.id, role: "OWNER", active: true },
      select: { userId: true },
    });
    if (owner) {
      await prisma.post.create({
        data: {
          clubId: club.id,
          authorId: owner.userId,
          type: "MILESTONE",
          body: [`${half === "AUTUMN" ? "Autumn" : "Spring"} is settled.`, ...moves].join("\n"),
          pinned: false,
        },
      });
    }
  }

  return { moves };
}

/**
 * Remind players of fixtures coming due.
 *
 * Real clubs arrange league games a week in advance; the thing that
 * actually kills a division is three unplayed fixtures at the deadline.
 */
export async function nudgeDueFixtures(seasonId: string) {
  const soon = new Date(Date.now() + NUDGE_DAYS * 86_400_000);

  const due = await prisma.leagueFixture.findMany({
    where: {
      state: "SCHEDULED",
      dueBy: { not: null, lte: soon, gte: new Date() },
      division: { seasonId },
    },
    include: {
      division: { include: { season: { include: { club: true } } } },
      white: { include: { profile: true } },
      black: { include: { profile: true } },
    },
  });

  for (const f of due) {
    await notify({
      userIds: [f.whiteId, f.blackId],
      type: "CLUB_ANNOUNCEMENT",
      title: `${f.division.name}: you still owe a game`,
      body: `${f.white.profile?.fullName ?? "White"} vs ${f.black.profile?.fullName ?? "Black"}. Arrange it between you.`,
      linkUrl: `/club/${f.division.season.club.slug}`,
    });
  }

  return { nudged: due.length };
}
