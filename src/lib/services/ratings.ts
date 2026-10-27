import { prisma } from "../prisma";
import type { SpeedCategory } from "@prisma/client";
import {
  update as glickoUpdate,
  decayRd,
  isProvisional,
  START_RATING,
  START_RD,
} from "@engine/rating/glicko";

/** A player's rating in one speed, created on first sight. */
export async function getOrCreateRating(userId: string, category: SpeedCategory) {
  const existing = await prisma.glyphRating.findUnique({
    where: { userId_category: { userId, category } },
  });
  if (existing) return existing;

  return prisma.glyphRating.create({
    data: { userId, category, rating: START_RATING, rd: START_RD, peak: START_RATING },
  });
}

/** Every rating a player holds, keyed by speed. */
export async function ratingsFor(userId: string) {
  const rows = await prisma.glyphRating.findMany({ where: { userId } });
  return Object.fromEntries(rows.map((r) => [r.category, r]));
}

/** What to print beside a name: the number, with a ? while still settling. */
export function displayRating(row: { rating: number; rd: number } | null | undefined): string {
  if (!row) return `${START_RATING}?`;
  return `${Math.round(row.rating)}${isProvisional(row.rd) ? "?" : ""}`;
}

/**
 * Settle a finished rated game.
 *
 * Idempotent on purpose: the move route, the resignation route and the
 * poll that notices a flag-fall can all arrive here for the same game,
 * and a rating must only ever be paid once. `whiteRatingDelta` is the
 * marker — it is null until the game has been settled.
 *
 * Both sides are computed from the pre-game numbers, so the order the
 * two updates happen in cannot change the outcome.
 */
export async function settleRatings(gameId: string) {
  const game = await prisma.liveGame.findUnique({ where: { id: gameId } });
  if (!game) return null;
  if (game.status !== "FINISHED" || !game.rated || !game.result) return null;
  if (game.whiteRatingDelta !== null) return null;

  const [w, b] = await Promise.all([
    getOrCreateRating(game.whiteId, game.category),
    getOrCreateRating(game.blackId, game.category),
  ]);

  // A rating that has been sitting idle is less trustworthy than its
  // number suggests; widen the deviation before using it.
  const periods = (row: { lastPlayedAt: Date | null }) => {
    if (!row.lastPlayedAt) return 0;
    const weeks = (Date.now() - row.lastPlayedAt.getTime()) / (7 * 24 * 3600 * 1000);
    return Math.max(0, Math.floor(weeks));
  };
  const wNow = { rating: w.rating, rd: decayRd(w.rd, periods(w)) };
  const bNow = { rating: b.rating, rd: decayRd(b.rd, periods(b)) };

  const whiteScore = game.result === "1-0" ? 1 : game.result === "0-1" ? 0 : 0.5;
  const blackScore = 1 - whiteScore;

  const wNext = glickoUpdate(wNow, [{ ...bNow, score: whiteScore }]);
  const bNext = glickoUpdate(bNow, [{ ...wNow, score: blackScore }]);

  const whiteBefore = Math.round(w.rating);
  const blackBefore = Math.round(b.rating);
  const whiteDelta = Math.round(wNext.rating) - whiteBefore;
  const blackDelta = Math.round(bNext.rating) - blackBefore;

  await prisma.$transaction([
    prisma.glyphRating.update({
      where: { id: w.id },
      data: {
        rating: wNext.rating,
        rd: wNext.rd,
        games: { increment: 1 },
        peak: Math.max(w.peak, Math.round(wNext.rating)),
        lastPlayedAt: new Date(),
      },
    }),
    prisma.glyphRating.update({
      where: { id: b.id },
      data: {
        rating: bNext.rating,
        rd: bNext.rd,
        games: { increment: 1 },
        peak: Math.max(b.peak, Math.round(bNext.rating)),
        lastPlayedAt: new Date(),
      },
    }),
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
