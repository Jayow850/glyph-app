import { prisma } from "../prisma";
import { notify } from "./notifications";
import { invalidate } from "../redis";
import { ratePair, type GameOutcome, type RatingState } from "@engine/rating/elo";
import type { MatchResult } from "@prisma/client";

/**
 * Dual-confirmation result flow (arbiter toolkit):
 * 1. Player A submits → SUBMITTED
 * 2. Player B submits same → CONFIRMED → ELO applies, scores update
 *    Player B submits different → DISPUTED → arbiter rules
 * Arbiter/organizer submission confirms immediately.
 * Offline-tolerant: accepts clientTimestamp for queued submissions.
 */
export async function submitResult(opts: {
  matchId: string;
  submitterId: string;
  result: MatchResult;
  isOfficial: boolean; // arbiter/organizer
  clientTimestamp?: Date;
  pgn?: string;
}) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: opts.matchId },
    include: { round: { include: { tournament: true } } },
  });
  if (!match.blackId || !match.whiteId) throw new Response("Byes need no result", { status: 400 });
  if (match.resultStatus === "CONFIRMED" || match.resultStatus === "ARBITER_RULED")
    throw new Response("Result already final", { status: 400 });

  const isPlayer = opts.submitterId === match.whiteId || opts.submitterId === match.blackId;
  if (!isPlayer && !opts.isOfficial) throw new Response("Not your board", { status: 403 });

  // First submission
  if (match.resultStatus === "PENDING" && !opts.isOfficial) {
    return prisma.match.update({
      where: { id: match.id },
      data: {
        result: opts.result,
        resultStatus: "SUBMITTED",
        submittedById: opts.submitterId,
        clientTimestamp: opts.clientTimestamp,
      },
    });
  }

  // Second submission or official ruling
  const agrees = opts.isOfficial || match.result === opts.result;
  const differentPlayer = opts.submitterId !== match.submittedById;

  if (!opts.isOfficial && !differentPlayer)
    throw new Response("Waiting for your opponent to confirm", { status: 400 });

  if (!agrees) {
    await prisma.match.update({ where: { id: match.id }, data: { resultStatus: "DISPUTED" } });
    await prisma.dispute.create({
      data: {
        matchId: match.id,
        raisedById: opts.submitterId,
        reason: `Conflicting results: ${match.result} vs ${opts.result}`,
      },
    });
    await notifyArbiters(match.round.tournament.clubId, match.id, match.round.tournament.name);
    return { disputed: true };
  }

  return confirmAndRate(match.id, opts.result, opts.isOfficial ? "ARBITER_RULED" : "CONFIRMED", opts.pgn);
}

async function confirmAndRate(matchId: string, result: MatchResult, status: "CONFIRMED" | "ARBITER_RULED", pgn?: string) {
  const match = await prisma.match.update({
    where: { id: matchId },
    data: { result, resultStatus: status, confirmedAt: new Date() },
    include: { round: { include: { tournament: true } } },
  });
  const t = match.round.tournament;

  const whitePts: number =
    result === "WHITE_WIN" || result === "BLACK_FORFEIT" ? 1 :
    result === "DRAW" ? 0.5 : 0;
  const blackPts: number =
    result === "BLACK_WIN" || result === "WHITE_FORFEIT" ? 1 :
    result === "DRAW" ? 0.5 : 0;

  await prisma.tournamentPlayer.update({
    where: { tournamentId_userId: { tournamentId: t.id, userId: match.whiteId! } },
    data: { score: { increment: whitePts }, colorHistory: { set: undefined } },
  });
  await prisma.$executeRaw`UPDATE "TournamentPlayer" SET "colorHistory" = "colorHistory" || 'W' WHERE "tournamentId" = ${t.id} AND "userId" = ${match.whiteId}`;
  await prisma.tournamentPlayer.update({
    where: { tournamentId_userId: { tournamentId: t.id, userId: match.blackId! } },
    data: { score: { increment: blackPts } },
  });
  await prisma.$executeRaw`UPDATE "TournamentPlayer" SET "colorHistory" = "colorHistory" || 'B' WHERE "tournamentId" = ${t.id} AND "userId" = ${match.blackId}`;

  // Rated ELO update (forfeits are not rated)
  const isForfeit = result.includes("FORFEIT");
  if (t.isRated && !isForfeit) {
    await applyElo(t.clubId, t.timeControl, match.whiteId!, match.blackId!, whitePts as GameOutcome, t.kFactorOverride, match.id, t.id);
  }

  // PGN archive
  if (pgn) {
    await prisma.game.create({
      data: { matchId: match.id, ownerId: match.whiteId!, pgn },
    });
  }

  await invalidate(`standings:${t.id}`);
  await notify({
    userIds: [match.whiteId!, match.blackId!],
    type: "RESULT",
    title: `Result confirmed on board ${match.boardNumber}`,
    linkUrl: `/tournaments/${t.id}/standings`,
  });
  return match;
}

async function applyElo(
  clubId: string, timeControl: string,
  whiteId: string, blackId: string,
  whiteOutcome: GameOutcome, kOverride: number | null,
  matchId: string, tournamentId: string
) {
  const [w, b] = await Promise.all([
    getOrCreateRating(whiteId, clubId, timeControl),
    getOrCreateRating(blackId, clubId, timeControl),
  ]);

  const res = ratePair(toState(w), toState(b), whiteOutcome, kOverride);

  for (const [rating, r] of [[w, res.white], [b, res.black]] as const) {
    await prisma.rating.update({
      where: { id: rating.id },
      data: {
        current: r.after,
        peak: r.newPeak,
        gamesPlayed: { increment: 1 },
        provisional: r.stillProvisional,
      },
    });
    await prisma.ratingHistory.create({
      data: { ratingId: rating.id, matchId, tournamentId, before: r.before, after: r.after, delta: r.delta },
    });
    if (Math.abs(r.delta) >= 15) {
      await notify({
        userIds: [rating.userId],
        type: "RATING_CHANGE",
        title: `Rating ${r.delta > 0 ? "+" : ""}${r.delta} → ${r.after}`,
      });
    }
  }
}

async function getOrCreateRating(userId: string, clubId: string, timeControl: string) {
  return prisma.rating.upsert({
    where: { userId_clubId_timeControl: { userId, clubId, timeControl: timeControl as never } },
    create: { userId, clubId, timeControl: timeControl as never },
    update: {},
  });
}

function toState(r: { current: number; peak: number; gamesPlayed: number; provisional: boolean; kFactor: number }): RatingState {
  return { current: r.current, peak: r.peak, gamesPlayed: r.gamesPlayed, provisional: r.provisional, kFactor: r.kFactor };
}

async function notifyArbiters(clubId: string, matchId: string, tournamentName: string) {
  const arbiters = await prisma.membership.findMany({
    where: { clubId, role: { in: ["ARBITER", "ORGANIZER", "ADMIN", "OWNER"] }, active: true },
  });
  await notify({
    userIds: arbiters.map((a) => a.userId),
    type: "DISPUTE",
    title: `Dispute raised in ${tournamentName}`,
    linkUrl: `/matches/${matchId}/dispute`,
    email: true,
  });
}

/** Arbiter ruling on a dispute — fully audited. */
export async function ruleDispute(opts: { matchId: string; arbiterId: string; result: MatchResult; ruling: string }) {
  await prisma.dispute.update({
    where: { matchId: opts.matchId },
    data: { arbiterId: opts.arbiterId, ruling: opts.ruling, resolvedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: { userId: opts.arbiterId, action: "DISPUTE_RULED", entity: "Match", entityId: opts.matchId, metadata: { result: opts.result, ruling: opts.ruling } },
  });
  return confirmAndRate(opts.matchId, opts.result, "ARBITER_RULED");
}
