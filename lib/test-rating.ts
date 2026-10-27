// Run: node --experimental-strip-types lib/test-rating.ts
import { update, g, expectedScore, decayRd, isProvisional, START_RATING, START_RD } from "./rating/glicko.ts";
import { classify, estimatedDurationSec, parseId, label, PRESETS, fromMinuteSpec } from "./game/timeControls.ts";

let pass = 0, fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = String(got) === String(want);
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${got}\n       want ${want}`); }
}
function near(name: string, got: number, want: number, tol: number) {
  const ok = Math.abs(got - want) <= tol;
  if (ok) { pass++; console.log(`  ok   ${name} (${got.toFixed(2)})`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${got}\n       want ${want} ±${tol}`); }
}

console.log("\nGlicko — Glickman's worked example");
// From the Glicko paper: a 1500/RD200 player beats 1400/30, loses to
// 1550/100 and 1700/300. The published answer is 1464.1 with RD 151.4.
{
  const out = update({ rating: 1500, rd: 200 }, [
    { rating: 1400, rd: 30, score: 1 },
    { rating: 1550, rd: 100, score: 0 },
    { rating: 1700, rd: 300, score: 0 },
  ]);
  near("rating lands on the published value", out.rating, 1464.1, 0.6);
  near("deviation lands on the published value", out.rd, 151.4, 0.6);
}

console.log("\nGlicko — behaviour that matters in play");
{
  const newcomer = { rating: START_RATING, rd: START_RD };
  const veteran = { rating: 1200, rd: 45 };

  const nAfter = update(newcomer, [{ ...veteran, score: 1 }]);
  const vAfter = update(veteran, [{ ...newcomer, score: 0 }]);

  near("a newcomer moves a long way on one win", nAfter.rating - newcomer.rating, 175, 25);
  near("the veteran they beat barely moves", Math.abs(vAfter.rating - veteran.rating), 5, 5);
  check("the newcomer's uncertainty shrinks", nAfter.rd < START_RD, true);
  check("a draw between equals changes nothing",
    Math.round(update({ rating: 1500, rd: 50 }, [{ rating: 1500, rd: 50, score: 0.5 }]).rating), 1500);
  check("a new player is provisional", isProvisional(START_RD), true);
  check("an established player is not", isProvisional(45), false);
  check("idleness widens the deviation", decayRd(50, 20) > 50, true);
  check("deviation is capped at unrated", decayRd(50, 10_000), 350);
  near("even odds against yourself", expectedScore(1500, 1500, 50), 0.5, 0.001);
  check("a certain opponent carries full weight", g(0) , 1);
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
  check("every preset classifies", PRESETS.every(p => p.category === classify(p.base, p.increment)), true);
  check("preset ids round-trip", PRESETS.every(p => parseId(p.id).base === p.base), true);

  check("arbiter's 15+10 becomes seconds", fromMinuteSpec("15+10", "RAPID"), "900+10");
  check("a bare 90 means ninety minutes", fromMinuteSpec("90", "CLASSICAL"), "5400+0");
  check("spacing does not matter", fromMinuteSpec(" 3 + 2 ", "BLITZ"), "180+2");
  check("nonsense falls back to the speed", fromMinuteSpec("G/90 d5", "BLITZ"), "180+2");
  check("nothing at all falls back too", fromMinuteSpec(null, "RAPID"), "600+0");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
