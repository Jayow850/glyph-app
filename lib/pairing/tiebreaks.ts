// ============================================================
// GLYPH TIEBREAK ENGINE
// Buchholz, Buchholz Cut-1, Sonneborn-Berger,
// Direct Encounter, Cumulative (progressive), Wins count.
// Configurable order per tournament.
// ============================================================

export interface PlayerResultRow {
  userId: string;
  score: number;
  // per-round: opponentId (null = bye) and points earned that round
  rounds: { opponentId: string | null; points: number }[];
}

export type TiebreakCode =
  | "BUCHHOLZ"
  | "BUCHHOLZ_CUT1"
  | "SONNEBORN_BERGER"
  | "DIRECT_ENCOUNTER"
  | "CUMULATIVE"
  | "WINS";

export interface Standing {
  userId: string;
  score: number;
  tiebreaks: Record<TiebreakCode, number>;
  rank: number;
}

function scoreMap(players: PlayerResultRow[]): Map<string, number> {
  return new Map(players.map((p) => [p.userId, p.score]));
}

/** Buchholz: sum of all opponents' scores (byes count as own score — organizer convention). */
export function buchholz(p: PlayerResultRow, scores: Map<string, number>): number {
  return p.rounds.reduce((sum, r) => {
    if (r.opponentId === null) return sum + p.score; // virtual opponent convention
    return sum + (scores.get(r.opponentId) ?? 0);
  }, 0);
}

/** Buchholz Cut-1: drop the lowest opponent score. */
export function buchholzCut1(p: PlayerResultRow, scores: Map<string, number>): number {
  const vals = p.rounds.map((r) =>
    r.opponentId === null ? p.score : scores.get(r.opponentId) ?? 0
  );
  if (vals.length <= 1) return vals[0] ?? 0;
  return vals.reduce((a, b) => a + b, 0) - Math.min(...vals);
}

/** Sonneborn-Berger: sum of defeated opponents' scores + half of drawn opponents' scores. */
export function sonnebornBerger(p: PlayerResultRow, scores: Map<string, number>): number {
  return p.rounds.reduce((sum, r) => {
    if (r.opponentId === null) return sum;
    const oppScore = scores.get(r.opponentId) ?? 0;
    if (r.points === 1) return sum + oppScore;
    if (r.points === 0.5) return sum + oppScore / 2;
    return sum;
  }, 0);
}

/** Cumulative (progressive): sum of running score after each round. */
export function cumulative(p: PlayerResultRow): number {
  let running = 0;
  let total = 0;
  for (const r of p.rounds) {
    running += r.points;
    total += running;
  }
  return total;
}

/** Number of wins (rewards fighting chess over short draws). */
export function winCount(p: PlayerResultRow): number {
  return p.rounds.filter((r) => r.points === 1 && r.opponentId !== null).length;
}

/**
 * Direct encounter score among a tied group:
 * points earned in games against other tied players.
 */
function directEncounter(
  p: PlayerResultRow,
  tiedIds: Set<string>
): number {
  return p.rounds.reduce((sum, r) => {
    if (r.opponentId && tiedIds.has(r.opponentId)) return sum + r.points;
    return sum;
  }, 0);
}

/**
 * Produce final standings with configurable tiebreak order.
 * Default FIDE-style club order: Buchholz → Sonneborn-Berger → Direct → Wins.
 */
export function computeStandings(
  players: PlayerResultRow[],
  order: TiebreakCode[] = ["BUCHHOLZ", "SONNEBORN_BERGER", "DIRECT_ENCOUNTER", "WINS"]
): Standing[] {
  const scores = scoreMap(players);

  const rows: Standing[] = players.map((p) => ({
    userId: p.userId,
    score: p.score,
    rank: 0,
    tiebreaks: {
      BUCHHOLZ: buchholz(p, scores),
      BUCHHOLZ_CUT1: buchholzCut1(p, scores),
      SONNEBORN_BERGER: sonnebornBerger(p, scores),
      CUMULATIVE: cumulative(p),
      WINS: winCount(p),
      DIRECT_ENCOUNTER: 0, // filled per tie group below
    },
  }));

  // Fill direct encounter within score-tied groups
  const byScore = new Map<number, Standing[]>();
  for (const r of rows) {
    const list = byScore.get(r.score) ?? [];
    list.push(r);
    byScore.set(r.score, list);
  }
  for (const [, group] of byScore) {
    if (group.length < 2) continue;
    const ids = new Set(group.map((g) => g.userId));
    for (const g of group) {
      const src = players.find((p) => p.userId === g.userId)!;
      g.tiebreaks.DIRECT_ENCOUNTER = directEncounter(src, ids);
    }
  }

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    for (const code of order) {
      const diff = b.tiebreaks[code] - a.tiebreaks[code];
      if (diff !== 0) return diff;
    }
    return 0;
  });

  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
