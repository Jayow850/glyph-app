import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { startClubNight, finishClubNight } from "@/lib/services/clubnight";

/**
 * Start the night, or close it out.
 *
 * There is no scheduler in this deployment, so this is a button an
 * organizer presses rather than a job that fires. That is stated
 * plainly rather than hidden behind a "starting automatically…"
 * label that would be a lie — and it is a one-line change to a cron
 * target when a scheduler exists.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  const night = await prisma.clubNight.findUnique({
    where: { id },
    select: { clubId: true, startsAt: true, state: true },
  });
  if (!night) return NextResponse.json({ error: "no_such_club_night" }, { status: 404 });

  const member = await prisma.membership.findFirst({
    where: { userId, clubId: night.clubId, active: true },
    select: { role: true },
  });
  if (!member || !["OWNER", "ADMIN", "ORGANIZER"].includes(member.role)) {
    return NextResponse.json({ error: "organizers_only" }, { status: 403 });
  }

  const finish = new URL(req.url).searchParams.get("finish") === "1";

  try {
    if (finish) {
      const done = await finishClubNight(id);
      return NextResponse.json(done ?? { error: "not_live" }, { status: done ? 200 : 409 });
    }
    if (night.startsAt.getTime() > Date.now()) {
      return NextResponse.json({ error: "too_early" }, { status: 400 });
    }
    const started = await startClubNight(id);
    return NextResponse.json(started);
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed";
    const status = message === "not_enough_players" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
