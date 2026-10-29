import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startClubNight, finishClubNight } from "@/lib/services/clubnight";

/**
 * The scheduler the app never had.
 *
 * Everything about club night was already lazily computed and
 * organizer-triggered, which worked but meant a night only began when
 * somebody pressed a button. This sweeps every club on a timer and
 * starts the ones whose moment has come.
 *
 * It is a sweep, not a per-night timer, so a missed tick is harmless:
 * the next run picks up whatever is due. That matters, because cron
 * delivery is best-effort.
 */

/** Don't start a night that has been sitting unstarted for hours. */
const STALE_MS = 2 * 60 * 60 * 1000;

/** Rounds take time; close a night out only well after it began. */
const FINISH_AFTER_MS = 6 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Unset means the endpoint stays shut rather than open. An open
  // endpoint here lets a stranger start every club night on the site.
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const started: string[] = [];
  const finished: string[] = [];
  const skipped: { id: string; why: string }[] = [];

  // Due: scheduled, active, start time passed, not hours stale.
  const due = await prisma.clubNight.findMany({
    where: {
      active: true,
      state: "SCHEDULED",
      startsAt: { lte: new Date(now), gte: new Date(now - STALE_MS) },
    },
    select: { id: true },
  });

  for (const night of due) {
    try {
      const res = await startClubNight(night.id);
      if (res && "tournamentId" in res && res.tournamentId) started.push(night.id);
    } catch (e) {
      // not_enough_players is the ordinary case, not an error: a night
      // nobody RSVP'd to should pass quietly rather than page anyone.
      skipped.push({ id: night.id, why: e instanceof Error ? e.message : "failed" });
    }
  }

  // Nights that began long enough ago to be over.
  const overdue = await prisma.clubNight.findMany({
    where: { state: "LIVE", startsAt: { lte: new Date(now - FINISH_AFTER_MS) } },
    select: { id: true },
  });

  for (const night of overdue) {
    try {
      await finishClubNight(night.id);
      finished.push(night.id);
    } catch (e) {
      skipped.push({ id: night.id, why: e instanceof Error ? e.message : "finish_failed" });
    }
  }

  return NextResponse.json({
    ok: true,
    checked: due.length + overdue.length,
    started,
    finished,
    skipped,
  });
}
