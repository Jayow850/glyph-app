// Run: npm run test:rating
import {
  update, decay, stakes, isProvisional,
  START_RATING, START_RD, START_VOLATILITY,
} from "./rating/glicko2.ts";
import {
  classify, estimatedDurationSec, parseId, label, PRESETS, fromMinuteSpec,
} from "./game/timeControls.ts";

let pass = 0, fail = 0;

function near(name: string, got: number, want: number, tol: number) {
  if (Math.abs(got - want) <= tol) { pass++; console.log(`  ok   ${name} (${got.toFixed(4)})`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${got}\n       want ${want} ±${tol}`); }
}

function check(name: string, got: unknown, want: unknown) {
  if (String(got) === String(want)) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${got}\n       want ${want}`); }
}

console.log("\nGlicko-2 — Glickman's published worked example");
{
  // 1500 / RD 200 / σ 0.06 against (1400,30,W) (1550,100,L) (1700,300,L).
  // The paper gives µ' = −0.2069, φ' = 0.8722, σ' = 0.05999.
  const out = update({ rating: 1500, rd: 200, volatility: 0.06 }, [
    { rating: 1400, rd: 30, score: 1 },
    { rating: 1550, rd: 100, score: 0 },
    { rating: 1700, rd: 300, score: 0 },
  ]);
  near("rating lands on 1464.06", out.rating, 1464.06, 0.1);
  near("deviation lands on 151.52", out.rd, 151.52, 0.1);
  near("volatility lands on 0.05999", out.volatility, 0.05999, 0.00005);
}

console.log("\nWhat a player actually feels");
{
  const newcomer = { rating: START_RATING, rd: START_RD, volatility: START_VOLATILITY };
  const veteran  = { rating: 1200, rd: 45, volatility: 0.06 };
  const strong   = { rating: 2100, rd: 45, volatility: 0.06 };

  const first = update(newcomer, [{ ...veteran, score: 1 }]);
  near("a newcomer's first win moves them a long way", first.rating - newcomer.rating, 175, 25);
  check("and their uncertainty shrinks", first.rd < START_RD, true);

  const beaten = update(veteran, [{ ...newcomer, score: 0 }]);
  near("the established player they beat barely moves", Math.abs(beaten.rating - veteran.rating), 4, 4);

  const crush = update(strong, [{ ...veteran, score: 1 }]);
  near("beating someone 900 points weaker is worth nothing", crush.rating - strong.rating, 0.3, 1.2);

  // The system is confident about a settled player, so even a shock
  // result moves them slowly. That confidence is the whole point —
  // it is what stops ratings yo-yoing.
  const upset = update(veteran, [{ ...strong, score: 1 }]);
  near("a settled player's huge upset is still a modest gain", upset.rating - veteran.rating, 16, 8);
  check("but the upset makes them less predictable", upset.volatility > veteran.volatility, true);

  const level = update({ rating: 1500, rd: 50, volatility: 0.06 }, [{ rating: 1500, rd: 50, score: 0.5 }]);
  near("a draw between equals changes nothing", level.rating, 1500, 0.5);

  check("a new player is provisional", isProvisional(START_RD), true);
  check("an established player is not", isProvisional(45), false);
  check("a rating never falls through the floor",
    update({ rating: 120, rd: 300, volatility: 0.06 }, [{ rating: 2400, rd: 40, score: 0 }]).rating >= 100, true);
}

console.log("\nInactivity");
{
  const idle = decay({ rating: 1600, rd: 50, volatility: 0.06 }, 40);
  check("sitting out widens the deviation", idle.rd > 50, true);
  check("but never moves the rating itself", Math.round(idle.rating), 1600);
  check("deviation is capped at unrated", decay({ rating: 1600, rd: 50, volatility: 0.06 }, 100_000).rd, 350);
  check("an empty rating period only adds uncertainty",
    update({ rating: 1600, rd: 60, volatility: 0.06 }, []).rd > 60, true);
}

console.log("\nStakes, shown before a challenge is accepted");
{
  const s = stakes({ rating: 1500, rd: 60, volatility: 0.06 }, { rating: 1520, rd: 60, volatility: 0.06 });
  check("a win is positive", s.win > 0, true);
  check("a loss is negative", s.loss < 0, true);
  check("beating a stronger player is worth more than losing costs", Math.abs(s.win) > Math.abs(s.loss), true);
}

console.log("\nTime controls — Lichess thresholds");
{
  check("5+3 estimates at 420s", estimatedDurationSec(300, 3), 420);
  check("1+0 is bullet", classify(60, 0), "BULLET");
  check("2+1 is still bullet at 160s", classify(120, 1), "BULLET");
  check("3+0 is blitz at exactly 180s", classify(180, 0), "BLITZ");
  check("5+3 is blitz at 420s", classify(300, 3), "BLITZ");
  check("10+0 is rapid", classify(600, 0), "RAPID");
  check("15+10 is rapid at 1300s", classify(900, 10), "RAPID");
  check("30+0 is classical at 1800s", classify(1800, 0), "CLASSICAL");
  check("boundary: 179s is the last bullet", classify(179, 0), "BULLET");
  check("boundary: 180s is the first blitz", classify(180, 0), "BLITZ");
  check("boundary: 1499s is the last rapid", classify(1499, 0), "RAPID");
  check("boundary: 1500s is the first classical", classify(1500, 0), "CLASSICAL");

  check("parses the wire format", JSON.stringify(parseId("900+10")), JSON.stringify({ base: 900, increment: 10 }));
  check("falls back on nonsense", JSON.stringify(parseId("")), JSON.stringify({ base: 600, increment: 0 }));
  check("labels a plain clock", label(600, 0), "10 min");
  check("labels an increment clock", label(900, 10), "15 | 10");
  check("every preset classifies", PRESETS.every((p) => p.category === classify(p.base, p.increment)), true);
  check("preset ids round-trip", PRESETS.every((p) => parseId(p.id).base === p.base), true);

  check("arbiter's 15+10 becomes seconds", fromMinuteSpec("15+10", "RAPID"), "900+10");
  check("a bare 90 means ninety minutes", fromMinuteSpec("90", "CLASSICAL"), "5400+0");
  check("spacing does not matter", fromMinuteSpec(" 3 + 2 ", "BLITZ"), "180+2");
  check("nonsense falls back to the speed", fromMinuteSpec("G/90 d5", "BLITZ"), "180+2");
  check("nothing at all falls back too", fromMinuteSpec(null, "RAPID"), "600+0");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
