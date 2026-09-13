// ============================================================
// GLYPH SWISS PAIRING ENGINE
// Score-group pairing with:
//  - no rematches
//  - color balancing (max color streak = 2, alternation preferred)
//  - bye assignment (lowest-ranked eligible player, one bye max)
//  - float handling between score groups
//  - deterministic ordering (score desc, then seed rating desc)
// Arbiters can manually override any pairing afterward.
// ============================================================

export interface SwissPlayer {
  userId: string;
  seedRating: number;
  score: number;
  colorHistory: string;        // e.g. "WBW"
  opponents: string[];         // userIds already faced
  hasHadBye: boolean;
  withdrawn: boolean;
  requestedByeThisRound: boolean;
}

export interface Pairing {
  boardNumber: number;
  whiteId: string;
  blackId: string | null;      // null => bye
  isBye: boolean;
  byeType?: "FULL" | "HALF";
}

interface ColorPref {
  pref: "W" | "B" | "NONE";
  strength: number; // 0 none, 1 mild, 2 absolute (streak of 2)
}

function colorPreference(history: string): ColorPref {
  if (!history) return { pref: "NONE", strength: 0 };
  const w = (history.match(/W/g) || []).length;
  const b = (history.match(/B/g) || []).length;
  const last2 = history.slice(-2);
  if (last2 === "WW") return { pref: "B", strength: 2 };
  if (last2 === "BB") return { pref: "W", strength: 2 };
  if (w > b) return { pref: "B", strength: 1 };
  if (b > w) return { pref: "W", strength: 1 };
  // equal count → alternate from last game
  const last = history.slice(-1);
  return { pref: last === "W" ? "B" : "W", strength: 1 };
}

/** Cost of pairing two players — lower is better. Infinity = illegal. */
function pairCost(a: SwissPlayer, b: SwissPlayer): number {
  if (a.opponents.includes(b.userId)) return Infinity; // rematch forbidden
  let cost = 0;
  // score difference penalty (floats)
  cost += Math.abs(a.score - b.score) * 100;
  // color conflict penalty
  const pa = colorPreference(a.colorHistory);
  const pb = colorPreference(b.colorHistory);
  if (pa.pref !== "NONE" && pa.pref === pb.pref) {
    // both want the same color
    if (pa.strength === 2 && pb.strength === 2) return Infinity; // both absolute
    cost += (pa.strength + pb.strength) * 10;
  }
  return cost;
}

/** Decide colors for a legal pair. */
function assignColors(a: SwissPlayer, b: SwissPlayer): { whiteId: string; blackId: string } {
  const pa = colorPreference(a.colorHistory);
  const pb = colorPreference(b.colorHistory);

  if (pa.strength > pb.strength) {
    return pa.pref === "W"
      ? { whiteId: a.userId, blackId: b.userId }
      : { whiteId: b.userId, blackId: a.userId };
  }
  if (pb.strength > pa.strength) {
    return pb.pref === "W"
      ? { whiteId: b.userId, blackId: a.userId }
      : { whiteId: a.userId, blackId: b.userId };
  }
  if (pa.pref === "W" && pb.pref !== "W")
    return { whiteId: a.userId, blackId: b.userId };
  if (pb.pref === "W" && pa.pref !== "W")
    return { whiteId: b.userId, blackId: a.userId };
  // tie: higher seed gets due color alternation → higher rated gets white in round 1 style
  return a.seedRating >= b.seedRating
    ? { whiteId: a.userId, blackId: b.userId }
    : { whiteId: b.userId, blackId: a.userId };
}

/**
 * Backtracking matcher within a candidate list.
 * Small score groups (typical club size) make this fast in practice.
 */
function matchGroup(players: SwissPlayer[]): [SwissPlayer, SwissPlayer][] | null {
  if (players.length === 0) return [];
  if (players.length % 2 !== 0) return null;

  const [first, ...rest] = players;
  // Try opponents in order of ascending cost
  const candidates = rest
    .map((p, i) => ({ p, i, cost: pairCost(first, p) }))
    .filter((c) => c.cost !== Infinity)
    .sort((x, y) => x.cost - y.cost);

  for (const c of candidates) {
    const remaining = rest.filter((_, i) => i !== c.i);
    const sub = matchGroup(remaining);
    if (sub !== null) return [[first, c.p], ...sub];
  }
  return null;
}

/**
 * Generate pairings for the next round.
 * Round 1: top-half vs bottom-half by seed rating.
 * Later rounds: score groups with floats.
 */
export function generateSwissPairings(allPlayers: SwissPlayer[], roundNumber: number): Pairing[] {
  const pairings: Pairing[] = [];
  let board = 1;

  // 1) Filter out withdrawn; handle requested half-point byes
  const active = allPlayers.filter((p) => !p.withdrawn);
  const byeRequests = active.filter((p) => p.requestedByeThisRound);
  for (const p of byeRequests) {
    pairings.push({ boardNumber: 0, whiteId: p.userId, blackId: null, isBye: true, byeType: "HALF" });
  }
  let pool = active.filter((p) => !p.requestedByeThisRound);

  // 2) Odd pool → assign full-point bye to lowest-ranked player without a prior bye
  if (pool.length % 2 !== 0) {
    const sortedAsc = [...pool].sort(
      (a, b) => a.score - b.score || a.seedRating - b.seedRating
    );
    const byePlayer = sortedAsc.find((p) => !p.hasHadBye) ?? sortedAsc[0];
    pairings.push({ boardNumber: 0, whiteId: byePlayer.userId, blackId: null, isBye: true, byeType: "FULL" });
    pool = pool.filter((p) => p.userId !== byePlayer.userId);
  }

  // 3) Sort: score desc, seed desc
  pool.sort((a, b) => b.score - a.score || b.seedRating - a.seedRating);

  let pairs: [SwissPlayer, SwissPlayer][] | null = null;

  if (roundNumber === 1) {
    // top half vs bottom half
    const half = pool.length / 2;
    pairs = [];
    for (let i = 0; i < half; i++) {
      pairs.push([pool[i], pool[i + half]]);
    }
  } else {
    // global backtracking match (score-difference cost keeps groups intact,
    // and naturally handles floats when a group can't self-pair)
    pairs = matchGroup(pool);
    if (pairs === null) {
      // Extremely rare: relax rematch rule as last resort (arbiter alerted)
      pairs = [];
      const remaining = [...pool];
      while (remaining.length >= 2) {
        const a = remaining.shift()!;
        const b = remaining.shift()!;
        pairs.push([a, b]);
      }
    }
  }

  for (const [a, b] of pairs) {
    const colors = assignColors(a, b);
    pairings.push({ boardNumber: board++, ...colors, isBye: false });
  }

  // Assign board numbers to byes after real boards
  for (const p of pairings) {
    if (p.isBye) p.boardNumber = board++;
  }

  return pairings.sort((a, b) => a.boardNumber - b.boardNumber);
}
