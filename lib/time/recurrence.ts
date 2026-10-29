// ============================================================
// Weekly recurrence that survives daylight saving.
//
// The naive version adds 7 × 24 hours. That is exact in Kenya, China
// and UTC, and wrong twice a year everywhere that changes its clocks:
// a London club night at 19:30 becomes 18:30 the week after the
// October change, and 20:30 after the March one. Members turn up an
// hour late to a game that already started.
//
// A weekly event is not "168 hours later". It is "the same wall-clock
// time, next week, where the club is". So we work in the club's own
// timezone: read the local wall-clock fields, add seven days to the
// date, and resolve back to an instant at that local time.
//
// No dependency. Intl.DateTimeFormat carries the full IANA database
// in every runtime this app targets.
// ============================================================

/** Fallback when a club has not told us where it is. */
export const DEFAULT_TZ = "UTC";

interface Wall {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
}

/** The wall-clock fields an instant shows in a given timezone. */
export function wallClockIn(instant: Date, timeZone: string): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return {
    year: get("year"), month: get("month"), day: get("day"),
    hour: get("hour"), minute: get("minute"), second: get("second"),
  };
}

/** How far the zone is from UTC, in ms, at a given instant. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const w = wallClockIn(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - instant.getTime();
}

/**
 * The instant at which the given wall-clock time occurs in a zone.
 *
 * A wall-clock time does not always name exactly one instant. On the
 * night clocks go back, 01:30 happens twice; on the night they go
 * forward, 01:30 never happens at all. So rather than solve for an
 * offset, we build the candidates from the offsets in force on either
 * side of the moment, and keep the ones that actually read back as the
 * time we asked for.
 *
 * Ambiguous resolves to the EARLIER occurrence and skipped resolves
 * FORWARD, which is what Temporal and every calendar app do, and what
 * a club expects: the night still happens.
 */
export function instantFromWallClock(w: Wall, timeZone: string): Date {
  const naive = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const HALF_DAY = 12 * 3600 * 1000;

  // The offsets a half-day either side bracket any transition between.
  const candidates = [
    naive - offsetMsAt(new Date(naive - HALF_DAY), timeZone),
    naive - offsetMsAt(new Date(naive + HALF_DAY), timeZone),
  ].sort((a, b) => a - b);

  for (const c of candidates) {
    const back = wallClockIn(new Date(c), timeZone);
    if (
      back.year === w.year && back.month === w.month && back.day === w.day &&
      back.hour === w.hour && back.minute === w.minute && back.second === w.second
    ) {
      return new Date(c);   // earliest that genuinely reads back
    }
  }

  // Nothing read back: this local time was skipped. Land just past the
  // gap rather than returning something that never existed.
  return new Date(candidates[candidates.length - 1]);
}

/**
 * The same local time, one week on, in the club's timezone.
 *
 * This is the function the weekly rollover uses.
 */
export function addWeekLocal(instant: Date, timeZone: string): Date {
  const w = wallClockIn(instant, timeZone);
  return instantFromWallClock({ ...w, day: w.day + 7 }, timeZone);
}

/**
 * The next occurrence strictly after `from`, keeping the club's local
 * time of day stable across any clock change in between.
 */
export function nextWeeklyOccurrence(from: Date, startsAt: Date, timeZone: string): Date {
  let next = new Date(startsAt);
  // A guard, not a condition: a year of weeks is far more than any
  // real gap, and it stops a malformed zone spinning forever.
  for (let i = 0; i < 60 && next.getTime() <= from.getTime(); i++) {
    next = addWeekLocal(next, timeZone);
  }
  return next;
}
