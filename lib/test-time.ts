// Run: npm run test:time
import { addWeekLocal, nextWeeklyOccurrence, wallClockIn, instantFromWallClock } from "./time/recurrence.ts";

let pass = 0, fail = 0;

function check(name: string, got: unknown, want: unknown) {
  if (String(got) === String(want)) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${got}\n       want ${want}`); }
}

/** "2026-10-28 19:30" as the clock reads in that zone. */
function local(d: Date, tz: string) {
  const w = wallClockIn(d, tz);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${w.year}-${p(w.month)}-${p(w.day)} ${p(w.hour)}:${p(w.minute)}`;
}

console.log("\nLondon — clocks go back 25 Oct 2026");
{
  // Wednesday 21 Oct, 19:30 London, which is 18:30 UTC while BST holds.
  const start = new Date("2026-10-21T18:30:00Z");
  check("the club meets at 19:30", local(start, "Europe/London"), "2026-10-21 19:30");

  const next = addWeekLocal(start, "Europe/London");
  check("next week is still 19:30 for the club", local(next, "Europe/London"), "2026-10-28 19:30");
  // The instant moved 25 hours, not 24×7 — that is the whole point.
  check("the instant absorbed the extra hour", next.toISOString(), "2026-10-28T19:30:00.000Z");

  // What the old code did, kept here so the bug cannot quietly return.
  const naive = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
  check("naive 7×24h would have been an hour early", local(naive, "Europe/London"), "2026-10-28 18:30");
}

console.log("\nLondon — clocks go forward 29 Mar 2026");
{
  const start = new Date("2026-03-25T19:30:00Z");   // 19:30 GMT
  check("the club meets at 19:30", local(start, "Europe/London"), "2026-03-25 19:30");
  check("and still does after the change",
    local(addWeekLocal(start, "Europe/London"), "Europe/London"), "2026-04-01 19:30");
}

console.log("\nNew York — clocks go back 1 Nov 2026");
{
  const start = new Date("2026-10-28T23:30:00Z");   // 19:30 EDT
  check("the club meets at 19:30", local(start, "America/New_York"), "2026-10-28 19:30");
  check("and still does after the change",
    local(addWeekLocal(start, "America/New_York"), "America/New_York"), "2026-11-04 19:30");
}

console.log("\nNairobi — no DST, so nothing may change");
{
  const start = new Date("2026-10-21T16:30:00Z");   // 19:30 EAT
  const next = addWeekLocal(start, "Africa/Nairobi");
  check("still 19:30", local(next, "Africa/Nairobi"), "2026-10-28 19:30");
  check("and exactly 168 hours on", next.toISOString(), "2026-10-28T16:30:00.000Z");
}

console.log("\nCatching up after a long gap");
{
  const next = nextWeeklyOccurrence(
    new Date("2026-11-20T00:00:00Z"),
    new Date("2026-10-21T18:30:00Z"),
    "Europe/London",
  );
  check("lands on the next Wednesday, still 19:30", local(next, "Europe/London"), "2026-11-25 19:30");
  check("and is in the future", next.getTime() > Date.parse("2026-11-20T00:00:00Z"), true);
}

console.log("\nThe awkward hours either side of a transition");
{
  // 01:30 on 25 Oct 2026 happens twice in London. We take the first.
  const ambiguous = instantFromWallClock(
    { year: 2026, month: 10, day: 25, hour: 1, minute: 30, second: 0 }, "Europe/London");
  check("an ambiguous local time resolves to the first occurrence",
    ambiguous.toISOString(), "2026-10-25T00:30:00.000Z");

  // 01:30 on 29 Mar 2026 does not exist in London; the night still happens.
  const skipped = instantFromWallClock(
    { year: 2026, month: 3, day: 29, hour: 1, minute: 30, second: 0 }, "Europe/London");
  check("a skipped local time resolves forward, not into the void",
    skipped.toISOString(), "2026-03-29T01:30:00.000Z");
}

console.log("\nA missing timezone falls back to UTC rather than throwing");
{
  const start = new Date("2026-10-21T18:30:00Z");
  check("UTC rolls forward by exactly a week",
    addWeekLocal(start, "UTC").toISOString(), "2026-10-28T18:30:00.000Z");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
