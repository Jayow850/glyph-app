// ============================================================
// Glicko-2 — GLYPH's native rating system.
//
// Glicko-1 carried a rating and a deviation. Glicko-2 adds a third
// number, volatility, which measures how erratic a player's results
// are. It is why a steady 1600 and a wild 1600 move differently after
// the same upset, and why a long win streak widens uncertainty instead
// of quietly compounding. Chess.com and Lichess both run Glicko-2.
//
// Reference: Mark Glickman, "Example of the Glicko-2 system" (glicko.net).
// Verified against that paper's worked example in lib/test-rating.ts.
// ============================================================

/** The scale constant that converts GLYPH ratings to Glicko-2's internal units. */
const SCALE = 173.7178;

/** Glicko-2 is defined around 1500 internally, whatever a player starts at. */
const ANCHOR = 1500;

/**
 * System constant τ. Constrains how fast volatility may move.
 * Glickman suggests 0.3–1.2; smaller is steadier. Lichess uses 0.75.
 */
const TAU = 0.5;

const EPSILON = 0.000001;

export const START_RATING = 1200;   // where a new GLYPH player begins
export const START_RD = 350;
export const START_VOLATILITY = 0.06;
export const MAX_RD = 350;
export const MIN_RD = 30;
export const PROVISIONAL_RD = 110;  // above this, the rating shows a "?"
export const RATING_FLOOR = 100;    // a rating cannot collapse below this

export interface Glicko2 {
  rating: number;
  rd: number;
  volatility: number;
}

export interface Opponent {
  rating: number;
  rd: number;
  /** 1 win, 0.5 draw, 0 loss. */
  score: number;
}

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

const expected = (mu: number, muJ: number, phiJ: number) =>
  1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/**
 * Solve for the new volatility by the Illinois variant of regula falsi,
 * exactly as the paper specifies. This is the part naive ports get
 * wrong — a fixed number of iterations instead of a convergence test.
 */
function newVolatility(phi: number, sigma: number, v: number, delta: number): number {
  const a = Math.log(sigma * sigma);
  const phi2 = phi * phi;
  const delta2 = delta * delta;

  const f = (x: number) => {
    const ex = Math.exp(x);
    const denom = phi2 + v + ex;
    return (ex * (delta2 - phi2 - v - ex)) / (2 * denom * denom) - (x - a) / (TAU * TAU);
  };

  let A = a;
  let B: number;

  if (delta2 > phi2 + v) {
    B = Math.log(delta2 - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }

  let fA = f(A);
  let fB = f(B);
  let guard = 0;

  while (Math.abs(B - A) > EPSILON && guard++ < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);

    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }

    B = C;
    fB = fC;
  }

  return Math.exp(A / 2);
}

/**
 * Fold a rating period's results into a rating. One game at a time is
 * how live play works; the maths is identical for a whole tournament
 * handed over at once.
 */
export function update(me: Glicko2, results: Opponent[]): Glicko2 {
  const mu = (me.rating - ANCHOR) / SCALE;
  const phi = me.rd / SCALE;

  // A player who did not compete only grows less certain.
  if (results.length === 0) {
    const phiPrime = Math.min(Math.sqrt(phi * phi + me.volatility * me.volatility), MAX_RD / SCALE);
    return { rating: me.rating, rd: phiPrime * SCALE, volatility: me.volatility };
  }

  let vInv = 0;
  let deltaSum = 0;

  for (const o of results) {
    const muJ = (o.rating - ANCHOR) / SCALE;
    const phiJ = o.rd / SCALE;
    const gJ = g(phiJ);
    const e = expected(mu, muJ, phiJ);

    vInv += gJ * gJ * e * (1 - e);
    deltaSum += gJ * (o.score - e);
  }

  const v = 1 / vInv;
  const delta = v * deltaSum;

  const sigmaPrime = newVolatility(phi, me.volatility, v, delta);
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return {
    rating: Math.max(RATING_FLOOR, muPrime * SCALE + ANCHOR),
    rd: Math.min(MAX_RD, Math.max(MIN_RD, phiPrime * SCALE)),
    volatility: sigmaPrime,
  };
}

/**
 * Inactivity. A rating nobody has tested lately deserves less
 * confidence, so a returning player moves in bigger steps again.
 * One "period" here is a week of not playing.
 */
export function decay(me: Glicko2, idlePeriods: number): Glicko2 {
  if (idlePeriods <= 0) return me;

  const phi = me.rd / SCALE;
  const grown = Math.sqrt(phi * phi + idlePeriods * me.volatility * me.volatility);

  return { ...me, rd: Math.min(MAX_RD, grown * SCALE) };
}

export const isProvisional = (rd: number) => rd > PROVISIONAL_RD;

export function formatRating(rating: number, rd: number): string {
  return `${Math.round(rating)}${isProvisional(rd) ? "?" : ""}`;
}

/** What a win and a loss would be worth, shown before a challenge is accepted. */
export function stakes(me: Glicko2, them: Glicko2): { win: number; loss: number; draw: number } {
  const after = (score: number) =>
    Math.round(update(me, [{ rating: them.rating, rd: them.rd, score }]).rating) - Math.round(me.rating);

  return { win: after(1), draw: after(0.5), loss: after(0) };
}
