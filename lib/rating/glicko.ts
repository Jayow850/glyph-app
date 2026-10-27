// ============================================================
// Glicko-1 — the rating system behind GLYPH.
//
// Plain Elo answers "how strong are you?" with a single number and
// treats a newcomer's 1200 as seriously as a veteran's. Glicko carries
// a second number, the rating deviation (RD), which is how sure the
// system is. A new player moves fast because nobody knows them yet; a
// player with 400 games barely moves. That is what makes a rating feel
// honest instead of jumpy.
//
// Reference: Mark Glickman, "The Glicko system" (glicko.net).
// Chess.com and Lichess both run Glicko variants for the same reason.
// ============================================================

export const START_RATING = 1200; // where a new GLYPH player begins
export const START_RD = 350;      // total uncertainty — an unrated player
export const MAX_RD = 350;
export const MIN_RD = 30;         // a rating never becomes perfectly certain
export const PROVISIONAL_RD = 110; // above this, show the rating with a "?"

const Q = Math.LN10 / 400; // ≈ 0.0057565

/**
 * Inactivity constant. Chosen so an established RD of 50 decays back to
 * a fully unrated 350 over about 100 idle rating periods: a player who
 * disappears for a year should not keep a confident rating.
 */
const C = 34.6;

export interface Glicko {
  rating: number;
  rd: number;
}

export interface OpponentResult {
  rating: number;
  rd: number;
  /** 1 win, 0.5 draw, 0 loss. */
  score: number;
}

/** Weighting for an opponent: the less certain they are, the less they count. */
export function g(rd: number): number {
  return 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));
}

/** Probability that a player of `rating` beats that opponent. */
export function expectedScore(rating: number, oppRating: number, oppRd: number): number {
  return 1 / (1 + Math.pow(10, (-g(oppRd) * (rating - oppRating)) / 400));
}

/** RD grows while a player is away, so a stale rating stops being trusted. */
export function decayRd(rd: number, idlePeriods: number): number {
  if (idlePeriods <= 0) return rd;
  return Math.min(Math.sqrt(rd * rd + C * C * idlePeriods), MAX_RD);
}

/**
 * Fold a batch of results into a rating. One game at a time is fine —
 * that is how live play works — but the maths is the same for a whole
 * tournament handed over at once.
 */
export function update(me: Glicko, results: OpponentResult[]): Glicko {
  if (results.length === 0) return me;

  let sum = 0;        // Σ g(RDj)·(sj − Ej)
  let invDSquared = 0; // 1/d² once scaled by q²

  for (const o of results) {
    const gj = g(o.rd);
    const e = expectedScore(me.rating, o.rating, o.rd);
    sum += gj * (o.score - e);
    invDSquared += gj * gj * e * (1 - e);
  }
  invDSquared *= Q * Q;

  const denominator = 1 / (me.rd * me.rd) + invDSquared;

  return {
    rating: me.rating + (Q / denominator) * sum,
    rd: Math.max(MIN_RD, Math.min(MAX_RD, Math.sqrt(1 / denominator))),
  };
}

export function isProvisional(rd: number): boolean {
  return rd > PROVISIONAL_RD;
}

/** How a rating is written: 1483 for settled, 1483? while still finding its level. */
export function formatRating(rating: number, rd: number): string {
  return `${Math.round(rating)}${isProvisional(rd) ? "?" : ""}`;
}
