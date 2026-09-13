// ============================================================
// GLYPH ELO ENGINE
// Standard Elo with configurable K-factor, provisional rules,
// and tournament performance rating calculation.
// ============================================================

export type GameOutcome = 1 | 0.5 | 0; // win / draw / loss (from player's perspective)

export interface RatingState {
  current: number;
  peak: number;
  gamesPlayed: number;
  provisional: boolean;
  kFactor: number;
}

export interface EloResult {
  before: number;
  after: number;
  delta: number;
  expectedScore: number;
  newPeak: number;
  stillProvisional: boolean;
}

const PROVISIONAL_GAME_THRESHOLD = 20;
const RATING_FLOOR = 100;

/** Expected score for player A vs player B (standard logistic curve). */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Dynamic K-factor policy (FIDE-inspired, organizer can override):
 * - provisional players (<20 games): K = 40
 * - rating < 2100: K = 32
 * - 2100–2399: K = 24
 * - >= 2400: K = 16
 */
export function resolveKFactor(state: RatingState, override?: number | null): number {
  if (override && override > 0) return override;
  if (state.gamesPlayed < PROVISIONAL_GAME_THRESHOLD) return 40;
  if (state.current < 2100) return 32;
  if (state.current < 2400) return 24;
  return 16;
}

/** Compute a single rating update after one game. */
export function updateRating(
  player: RatingState,
  opponentRating: number,
  outcome: GameOutcome,
  kOverride?: number | null
): EloResult {
  const k = resolveKFactor(player, kOverride);
  const expected = expectedScore(player.current, opponentRating);
  const rawDelta = k * (outcome - expected);
  const delta = Math.round(rawDelta);
  const after = Math.max(RATING_FLOOR, player.current + delta);

  return {
    before: player.current,
    after,
    delta: after - player.current,
    expectedScore: expected,
    newPeak: Math.max(player.peak, after),
    stillProvisional: player.gamesPlayed + 1 < PROVISIONAL_GAME_THRESHOLD,
  };
}

/**
 * Tournament performance rating (linear approximation):
 * avg opponent rating + 400 * (wins - losses) / games
 * Byes and forfeits are excluded.
 */
export function performanceRating(
  opponentRatings: number[],
  outcomes: GameOutcome[]
): number | null {
  if (opponentRatings.length === 0) return null;
  const avg =
    opponentRatings.reduce((a, b) => a + b, 0) / opponentRatings.length;
  const score = outcomes.reduce((a, b) => a + b, 0 as number);
  const n = outcomes.length;
  const winsMinusLosses = 2 * score - n; // (W - L) since draws cancel
  return Math.round(avg + (400 * winsMinusLosses) / n);
}

/** Batch update after a rated match — returns both players' results. */
export function ratePair(
  white: RatingState,
  black: RatingState,
  whiteOutcome: GameOutcome,
  kOverride?: number | null
): { white: EloResult; black: EloResult } {
  const blackOutcome = (1 - whiteOutcome) as GameOutcome;
  return {
    white: updateRating(white, black.current, whiteOutcome, kOverride),
    black: updateRating(black, white.current, blackOutcome, kOverride),
  };
}
