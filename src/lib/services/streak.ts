import { prisma } from "@/lib/prisma";

/**
 * Club streaks.
 *
 * Derived from the games themselves rather than stored on the profile.
 * A counter column has to be nudged by something — a cron, a hook on
 * every result, a backfill when either is missed — and a streak that
 * silently drifts from the games it claims to count is worse than no
 * streak. The games are the record; this reads them.
 *
 * The rules come from what Duolingo learned the hard way:
 *
 *  - ONE game keeps the day alive. The streak is decoupled from any
 *    goal, because a streak tied to a target punishes a busy day and
 *    people quit rather than fail.
 *  - A lapsed day is RECOVERABLE, not lost: play two today and
 *    yesterday is earned back. Recovery beats punishment, and nothing
 *    here is ever sold.
 *  - It is read in the club's context, because a streak kept alongside
 *    other people is a different thing from a number kept alone.
 */

/** How far back to look. Longer than any streak worth displaying. */
const WINDOW_DAYS = 120;

export interface Streak {
  /** Consecutive days up to and including today (or yesterday). */
  days: number;
  /** Games played today. */
  today: number;
  /** Yesterday lapsed, but today can still buy it back. */
  recoverable: boolean;
  /** The longest run this player has had inside the window. */
  best: number;
}

/** UTC day key. One clock for the whole club beats arguing about zones. */
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function fromDays(played: Set<string>): Streak {
  const now = new Date();
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));

  // Count back from today if played, otherwise from yesterday — a day
  // that has not finished yet must not break anything.
  let cursor = played.has(today) ? new Date(now) : new Date(now.getTime() - 86_400_000);
  let days = 0;
  while (played.has(dayKey(cursor))) {
    days++;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }

  // Longest run in the window, for "best".
  const sorted = [...played].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    const expected = previous
      ? dayKey(new Date(new Date(`${previous}T00:00:00Z`).getTime() + 86_400_000))
      : null;
    run = previous && day === expected ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }

  return {
    days,
    today: 0,
    // Nothing yesterday and nothing today yet: the run is paused, not
    // gone, and saying so is the whole point.
    recoverable: !played.has(today) && !played.has(yesterday) && days === 0 && played.size > 0,
    best,
  };
}

/**
 * Streaks for a set of players, in one query.
 *
 * Per-player queries would be the obvious shape and would mean one
 * round trip per club member every time the Games page loads.
 */
export async function streaksFor(userIds: string[]): Promise<Map<string, Streak>> {
  const out = new Map<string, Streak>();
  if (userIds.length === 0) return out;

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const games = await prisma.liveGame.findMany({
    where: {
      status: { not: "ACTIVE" },
      updatedAt: { gte: since },
      OR: [{ whiteId: { in: userIds } }, { blackId: { in: userIds } }],
      // An aborted game is not a game played.
      NOT: { endReason: "aborted" },
    },
    select: { whiteId: true, blackId: true, updatedAt: true },
  });

  const byPlayer = new Map<string, Set<string>>();
  const todayKey = dayKey(new Date());
  const todayCount = new Map<string, number>();

  for (const g of games) {
    const day = dayKey(g.updatedAt);
    for (const id of [g.whiteId, g.blackId]) {
      if (!userIds.includes(id)) continue;
      if (!byPlayer.has(id)) byPlayer.set(id, new Set());
      byPlayer.get(id)!.add(day);
      if (day === todayKey) todayCount.set(id, (todayCount.get(id) ?? 0) + 1);
    }
  }

  for (const id of userIds) {
    const streak = fromDays(byPlayer.get(id) ?? new Set());
    streak.today = todayCount.get(id) ?? 0;
    out.set(id, streak);
  }
  return out;
}

/** The last few results, newest first, as W / L / D. */
export async function recentForm(userId: string, take = 5): Promise<("W" | "L" | "D")[]> {
  const games = await prisma.liveGame.findMany({
    where: {
      status: { not: "ACTIVE" },
      result: { not: null },
      NOT: { endReason: "aborted" },
      OR: [{ whiteId: userId }, { blackId: userId }],
    },
    orderBy: { updatedAt: "desc" },
    take,
    select: { whiteId: true, result: true },
  });

  return games.map((g) => {
    if (g.result === "1/2-1/2") return "D";
    const youWereWhite = g.whiteId === userId;
    const whiteWon = g.result === "1-0";
    return youWereWhite === whiteWon ? "W" : "L";
  });
}
