// Simulates a full 8-player, 3-round Swiss tournament end-to-end:
// pairings → results → ELO updates → tiebreak standings.
// Run: node --experimental-strip-types lib/test-tournament.ts

import { generateSwissPairings, type SwissPlayer } from "./pairing/swiss.ts";
import { computeStandings, type PlayerResultRow } from "./pairing/tiebreaks.ts";
import { ratePair, performanceRating, type RatingState, type GameOutcome } from "./rating/elo.ts";

const names: Record<string, string> = {};
const players: SwissPlayer[] = [];
const ratings = new Map<string, RatingState>();
const results = new Map<string, PlayerResultRow>();

const roster: [string, number][] = [
  ["magnus_local", 1950], ["anna_k", 1820], ["dev_okoro", 1750], ["li_wei", 1700],
  ["sofia_r", 1610], ["tunde_a", 1540], ["pri_sharma", 1480], ["jack_m", 1350],
];

for (const [id, r] of roster) {
  names[id] = id;
  players.push({
    userId: id, seedRating: r, score: 0, colorHistory: "",
    opponents: [], hasHadBye: false, withdrawn: false, requestedByeThisRound: false,
  });
  ratings.set(id, { current: r, peak: r, gamesPlayed: 25, provisional: false, kFactor: 32 });
  results.set(id, { userId: id, score: 0, rounds: [] });
}

// Deterministic "simulated" outcome: higher rating usually wins
function simulate(white: string, black: string, round: number): GameOutcome {
  const rw = ratings.get(white)!.current;
  const rb = ratings.get(black)!.current;
  const diff = rw - rb;
  if (Math.abs(diff) < 60) return 0.5;             // close ratings → draw
  if ((round + rw) % 7 === 0) return diff > 0 ? 0 : 1; // occasional upset
  return diff > 0 ? 1 : 0;
}

for (let round = 1; round <= 3; round++) {
  console.log(`\n===== ROUND ${round} =====`);
  const pairings = generateSwissPairings(players, round);

  for (const p of pairings) {
    if (p.isBye) {
      const pl = players.find((x) => x.userId === p.whiteId)!;
      const pts = p.byeType === "HALF" ? 0.5 : 1;
      pl.score += pts;
      pl.hasHadBye = true;
      results.get(p.whiteId)!.rounds.push({ opponentId: null, points: pts });
      results.get(p.whiteId)!.score += pts;
      console.log(`Board ${p.boardNumber}: ${p.whiteId} — BYE (${pts})`);
      continue;
    }

    const outcome = simulate(p.whiteId, p.blackId!, round);
    const w = players.find((x) => x.userId === p.whiteId)!;
    const b = players.find((x) => x.userId === p.blackId)!;

    w.score += outcome; b.score += 1 - outcome;
    w.colorHistory += "W"; b.colorHistory += "B";
    w.opponents.push(b.userId); b.opponents.push(w.userId);

    results.get(w.userId)!.rounds.push({ opponentId: b.userId, points: outcome });
    results.get(w.userId)!.score += outcome;
    results.get(b.userId)!.rounds.push({ opponentId: w.userId, points: 1 - outcome });
    results.get(b.userId)!.score += 1 - outcome;

    const { white, black } = ratePair(ratings.get(w.userId)!, ratings.get(b.userId)!, outcome);
    const rw = ratings.get(w.userId)!; rw.current = white.after; rw.peak = white.newPeak; rw.gamesPlayed++;
    const rb = ratings.get(b.userId)!; rb.current = black.after; rb.peak = black.newPeak; rb.gamesPlayed++;

    const res = outcome === 1 ? "1-0" : outcome === 0 ? "0-1" : "½-½";
    console.log(
      `Board ${p.boardNumber}: ${w.userId} vs ${b.userId} → ${res}  ` +
      `(Elo ${white.delta >= 0 ? "+" : ""}${white.delta} / ${black.delta >= 0 ? "+" : ""}${black.delta})`
    );
  }
}

console.log("\n===== FINAL STANDINGS =====");
const standings = computeStandings([...results.values()]);
for (const s of standings) {
  const perf = performanceRating(
    results.get(s.userId)!.rounds.filter(r => r.opponentId).map(r => ratings.get(r.opponentId!)!.current),
    results.get(s.userId)!.rounds.filter(r => r.opponentId).map(r => r.points as GameOutcome),
  );
  console.log(
    `${String(s.rank).padStart(2)}. ${s.userId.padEnd(14)} ${s.score} pts  ` +
    `Buch=${s.tiebreaks.BUCHHOLZ.toFixed(1)} SB=${s.tiebreaks.SONNEBORN_BERGER.toFixed(2)} ` +
    `DE=${s.tiebreaks.DIRECT_ENCOUNTER} | Elo now ${ratings.get(s.userId)!.current} | Perf ${perf}`
  );
}
