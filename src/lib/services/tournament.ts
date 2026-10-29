import { prisma } from "../prisma";
import { invalidate } from "../redis";
import { notify } from "./notifications";
import { generateSwissPairings, type SwissPlayer } from "@engine/pairing/swiss";
import { computeStandings, type PlayerResultRow, type TiebreakCode } from "@engine/pairing/tiebreaks";
import { performanceRating, type GameOutcome } from "@engine/rating/elo";
import { fromMinuteSpec, parseId, classify, type SpeedCategory } from "@engine/game/timeControls";
import { awardTournamentAchievements } from "./achievements";

/** Load tournament players into the pairing engine's shape. */
async function loadSwissPlayers(tournamentId: string, roundNumber: number): Promise<SwissPlayer[]> {
  const entries = await prisma.tournamentPlayer.findMany({
    where: { tournamentId },
    include: { user: true },
  });
  const past = await prisma.match.findMany({
    where: { round: { tournamentId } },
  });

  return entries.map((e) => {
    const opponents: string[] = [];
    let hasHadBye = false;
    for (const m of past) {
      if (m.whiteId === e.userId) {
        if (m.blackId) opponents.push(m.blackId);
        else hasHadBye = true;
      } else if (m.blackId === e.userId && m.whiteId) {
        opponents.push(m.whiteId);
      }
    }
    return {
      userId: e.userId,
      seedRating: e.seedRating,
      score: e.score,
      colorHistory: e.colorHistory,
      opponents,
      hasHadBye,
      withdrawn: e.withdrawn,
      requestedByeThisRound: e.requestedByes.includes(roundNumber),
    };
  });
}

/** Pair the next round. Organizer/arbiter only (enforced at API layer). */
export async function pairNextRound(tournamentId: string) {
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
  if (t.currentRound >= t.totalRounds) throw new Response("All rounds already paired", { status: 400 });

  // previous round must be fully confirmed
  if (t.currentRound > 0) {
    const open = await prisma.match.count({
      where: {
        round: { tournamentId, number: t.currentRound },
        resultStatus: { in: ["PENDING", "SUBMITTED", "DISPUTED"] },
      },
    });
    if (open > 0) throw new Response(`Round ${t.currentRound} has ${open} unconfirmed results`, { status: 400 });
  }

  const nextNumber = t.currentRound + 1;
  const players = await loadSwissPlayers(tournamentId, nextNumber);
  const pairings = generateSwissPairings(players.filter(p => !p.withdrawn || true), nextNumber);

  const round = await prisma.round.create({
    data: { tournamentId, number: nextNumber, startsAt: new Date() },
  });

  // Every board becomes a real game on a real clock. "15+10" the way an
  // arbiter writes it, translated into the seconds the board runs on.
  const timeControl = fromMinuteSpec(t.timeControlDetail, t.timeControl as SpeedCategory);
  const { base, increment } = parseId(timeControl);
  const category = classify(base, increment);
  const initialMs = base * 1000;
  const incrementMs = increment * 1000;

  for (const p of pairings) {
    let liveGameId: string | null = null;

    if (!p.isBye && p.blackId) {
      const game = await prisma.liveGame.create({
        data: {
          whiteId: p.whiteId,
          blackId: p.blackId,
          timeControl,
          category,
          whiteMs: initialMs,
          blackMs: initialMs,
          incrementMs,
          lastMoveAt: new Date(),
          clockStarted: false,
          /**
           * Tournament boards move the platform rating too.
           *
           * They used to be `rated: false`, on the reasoning that a
           * tournament runs its own Elo with its own K-factor. In
           * practice that meant a member could play ten club nights
           * and watch the number on their profile never move, because
           * the only rating the app shows anywhere is the Glicko-2 one.
           * The per-club Elo still updates alongside it — they measure
           * different things — but the rating people actually see now
           * reflects the games they actually played.
           *
           * It also fills whiteRatingBefore/blackRatingBefore, which
           * only settleRatings writes; without them the club-night
           * recap could never work out the biggest upset.
           *
           * An organiser who marks a tournament unrated still gets an
           * unrated tournament.
           */
          rated: t.isRated,
        },
      });
      liveGameId = game.id;
    }

    await prisma.match.create({
      data: {
        roundId: round.id,
        boardNumber: p.boardNumber,
        whiteId: p.whiteId,
        blackId: p.blackId,
        liveGameId,
        result: p.isBye ? (p.byeType === "HALF" ? "BYE_HALF" : "BYE_FULL") : "PENDING",
        resultStatus: p.isBye ? "CONFIRMED" : "PENDING",
      },
    });

    if (p.isBye) {
      const pts = p.byeType === "HALF" ? 0.5 : 1;
      await prisma.tournamentPlayer.update({
        where: { tournamentId_userId: { tournamentId, userId: p.whiteId } },
        data: { score: { increment: pts } },
      });
    }
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { currentRound: nextNumber, status: "IN_PROGRESS" },
  });

  await notify({
    userIds: players.map((p) => p.userId),
    type: "PAIRING",
    title: `Round ${nextNumber} pairings are out — ${t.name}`,
    linkUrl: `/tournaments/${tournamentId}`,
    email: true,
  });
  await invalidate(`standings:${tournamentId}`);
  return round;
}

/** Compute live standings with the tournament's configured tiebreak order. */
export async function standings(tournamentId: string) {
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
  const entries = await prisma.tournamentPlayer.findMany({
    where: { tournamentId },
    include: { user: { include: { profile: true } } },
  });
  const matches = await prisma.match.findMany({
    where: { round: { tournamentId }, resultStatus: { in: ["CONFIRMED", "ARBITER_RULED"] } },
    include: { round: true },
    orderBy: { round: { number: "asc" } },
  });

  const rows: PlayerResultRow[] = entries.map((e) => {
    const rounds: { opponentId: string | null; points: number }[] = [];
    for (const m of matches) {
      if (m.whiteId === e.userId) {
        const pts =
          m.result === "WHITE_WIN" || m.result === "BLACK_FORFEIT" || m.result === "BYE_FULL" ? 1 :
          m.result === "DRAW" || m.result === "BYE_HALF" ? 0.5 : 0;
        rounds.push({ opponentId: m.blackId, points: pts });
      } else if (m.blackId === e.userId) {
        const pts =
          m.result === "BLACK_WIN" || m.result === "WHITE_FORFEIT" ? 1 :
          m.result === "DRAW" ? 0.5 : 0;
        rounds.push({ opponentId: m.whiteId, points: pts });
      }
    }
    return { userId: e.userId, score: e.score, rounds };
  });

  const table = computeStandings(rows, t.tiebreakOrder as TiebreakCode[]);
  return table.map((s) => ({
    ...s,
    player: entries.find((e) => e.userId === s.userId)!.user.profile,
  }));
}

/** Finalize: performance ratings, final ranks, achievements. */
export async function finalizeTournament(tournamentId: string) {
  const table = await standings(tournamentId);
  const matches = await prisma.match.findMany({
    where: { round: { tournamentId }, blackId: { not: null } },
  });
  const seeds = new Map(
    (await prisma.tournamentPlayer.findMany({ where: { tournamentId } }))
      .map((e) => [e.userId, e.seedRating])
  );

  for (const row of table) {
    const oppRatings: number[] = [];
    const outcomes: GameOutcome[] = [];
    for (const m of matches) {
      if (m.whiteId === row.userId && m.blackId) {
        oppRatings.push(seeds.get(m.blackId) ?? 1200);
        outcomes.push(m.result === "WHITE_WIN" ? 1 : m.result === "DRAW" ? 0.5 : 0);
      } else if (m.blackId === row.userId && m.whiteId) {
        oppRatings.push(seeds.get(m.whiteId) ?? 1200);
        outcomes.push(m.result === "BLACK_WIN" ? 1 : m.result === "DRAW" ? 0.5 : 0);
      }
    }
    await prisma.tournamentPlayer.update({
      where: { tournamentId_userId: { tournamentId, userId: row.userId } },
      data: { finalRank: row.rank, performanceRating: performanceRating(oppRatings, outcomes) },
    });
  }

  await prisma.tournament.update({ where: { id: tournamentId }, data: { status: "COMPLETED" } });
  await awardTournamentAchievements(tournamentId, table.map(t => ({ userId: t.userId, rank: t.rank })));
  return table;
}
