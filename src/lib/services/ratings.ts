import { prisma } from "../prisma";
import type { SpeedCategory } from "@prisma/client";
import {
  update as glicko,
  decay,
  stakes as glickoStakes,
  isProvisional,
  START_RATING,
  START_RD,
  START_VOLATILITY,
} from "@engine/rating/glicko2";

/** A player's rating in one speed, created on first sight. */
export async function getOrCreateRating(userId: string, category: SpeedCategory) {
  const existing = await prisma.glyphRating.findUnique({
    where: { userId_category: { userId, category } },
  });
  if (existing) return existing;

  return prisma.glyphRating.create({
    data: {
      userId,
      category,
      rating: START_RATING,
      rd: START_RD,
      volatility: START_VOLATILITY,
      peak: START_RATING,
    },
  });
}

export async function ratingsFor(userId: string) {
  const rows = await prisma.glyphRating.findMany({ where: { userId } });
  return Object.fromEntries(rows.map((r) => [r.category, r]));
}

/** What to print beside a name: the number, with a ? while still settling. */
export function displayRating(row: { rating: number; rd: number } | null | undefined): string {
  if (!row) return `${START_RATING}?`;
  return `${Math.round(row.rating)}${isProvisional(row.rd) ? "?" : ""}`;
}

/** Weeks since this rating last did anything — Glicko's idle periods. */
function idleWeeks(row: { lastPlayedAt: Date | null }) {
  if (!row.lastPlayedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - row.lastPlayedAt.getTime()) / (7 * 24 * 3600 * 1000)));
}

/** What a win, draw or loss against this opponent is worth, before you agree to play. */
export async function stakesBetween(userId: string, opponentId: string, category: SpeedCategory) {
  const [me, them] = await Promise.all([
    getOrCreateRating(userId, category),
    getOrCreateRating(opponentId, category),
  ]);
  return glickoStakes(
    { rating: me.rating, rd: decayed(me), volatility: me.volatility },
    { rating: them.rating, rd: decayed(them), volatility: them.volatility },
  );
}

function decayed(row: { rating: number; rd: number; volatility: number; lastPlayedAt: Date | null }) {
  return decay({ rating: row.rating, rd: row.rd, volatility: row.volatility }, idleWeeks(row)).rd;
}

/**
 * Settle a finished rated game.
 *
 * Idempotent on purpose: the move route, the resignation route and the
 * poll that notices a flag-fall can all arrive here for the same game,
 * and a rating must only ever be paid once. `whiteRatingDelta` is the
 * marker — null until the game has been settled.
 *
 * Both sides are computed from the pre-game numbers, so the order the
 * two updates happen in cannot change the outcome.
 */
export async function settleRatings(gameId: string) {
  const game = await prisma.liveGame.findUnique({ where: { id: gameId } });
  if (!game) return null;
  if (game.status !== "FINISHED" || !game.rated || !game.result) return null;
  if (game.whiteRatingDelta !== null) return null;

  // A game nobody really played does not move anybody's rating.
  if (game.sans.length < 2) return null;

  const [w, b] = await Promise.all([
    getOrCreateRating(game.whiteId, game.category),
    getOrCreateRating(game.blackId, game.category),
  ]);

  // A rating left idle deserves less confidence than its number suggests.
  const wNow = { rating: w.rating, rd: decayed(w), volatility: w.volatility };
  const bNow = { rating: b.rating, rd: decayed(b), volatility: b.volatility };

  const whiteScore = game.result === "1-0" ? 1 : game.result === "0-1" ? 0 : 0.5;
  const blackScore = 1 - whiteScore;

  const wNext = glicko(wNow, [{ rating: bNow.rating, rd: bNow.rd, score: whiteScore }]);
  const bNext = glicko(bNow, [{ rating: wNow.rating, rd: wNow.rd, score: blackScore }]);

  const whiteBefore = Math.round(w.rating);
  const blackBefore = Math.round(b.rating);
  const whiteAfter = Math.round(wNext.rating);
  const blackAfter = Math.round(bNext.rating);
  const whiteDelta = whiteAfter - whiteBefore;
  const blackDelta = blackAfter - blackBefore;

  const now = new Date();
  const outcome = (score: number) => (score === 1 ? "win" : score === 0 ? "loss" : "draw");

  const side = (
    row: typeof w,
    next: typeof wNext,
    after: number,
    before: number,
    delta: number,
    score: number,
    oppRating: number,
  ) => [
    prisma.glyphRating.update({
      where: { id: row.id },
      data: {
        rating: next.rating,
        rd: next.rd,
        volatility: next.volatility,
        games: { increment: 1 },
        wins: { increment: score === 1 ? 1 : 0 },
        losses: { increment: score === 0 ? 1 : 0 },
        draws: { increment: score === 0.5 ? 1 : 0 },
        peak: Math.max(row.peak, after),
        peakAt: after > row.peak ? now : row.peakAt,
        lastPlayedAt: now,
      },
    }),
    prisma.glyphRatingHistory.create({
      data: {
        glyphRatingId: row.id,
        liveGameId: gameId,
        before,
        after,
        delta,
        opponentRating: Math.round(oppRating),
        result: outcome(score),
      },
    }),
  ];

  await prisma.$transaction([
    ...side(w, wNext, whiteAfter, whiteBefore, whiteDelta, whiteScore, bNow.rating),
    ...side(b, bNext, blackAfter, blackBefore, blackDelta, blackScore, wNow.rating),
    prisma.liveGame.update({
      where: { id: gameId },
      data: {
        whiteRatingBefore: whiteBefore,
        blackRatingBefore: blackBefore,
        whiteRatingDelta: whiteDelta,
        blackRatingDelta: blackDelta,
      },
    }),
  ]);

  return { whiteBefore, blackBefore, whiteDelta, blackDelta };
}

/**
 * Call after any write that may have ended a game. Never throws into
 * the route: a game that finished correctly must not 500 because a
 * rating or a tournament scoresheet had trouble.
 */
export async function settleIfFinished(gameId: string, status: string) {
  if (status !== "FINISHED") return;

  try {
    await settleRatings(gameId);
  } catch {
    /* a rating that fails to settle must not break the game */
  }

  try {
    // No-op unless this game was a tournament board.
    const { settleTournamentBoard } = await import("./results");
    await settleTournamentBoard(gameId);
  } catch {
    /* likewise for the wallchart */
  }
}
