import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canRunCompetitions } from "@/lib/services/officers";
import { requireUser } from "@/lib/auth";
import { addWeekLocal, DEFAULT_TZ } from "@engine/time/recurrence";

/**
 * Set or change the club's weekly night. One per club: it is a rhythm,
 * not a calendar.
 *
 * The client sends `startsAt` as an exact instant, not a wall-clock
 * string. An earlier version took "19:30" and built a Date from it on
 * the server — which meant the server's own timezone decided what
 * 19:30 was. On Vercel that is UTC, so a Nairobi organiser setting
 * half seven got a club night at half ten. The browser knows which
 * evening the organiser meant; the server should not be guessing.
 *
 * `dayOfWeek` is the weekday as the organiser sees it locally, stored
 * for display only — the instant is what everything else runs on.
 */
const Body = z.object({
  /** ISO 8601 with offset, e.g. 2026-11-04T16:30:00.000Z. */
  startsAt: z.string().datetime(),
  /** 0 = Sunday, in the organiser's own timezone. */
  dayOfWeek: z.number().int().min(0).max(6),
  timeControl: z.string().regex(/^\d{1,5}\+\d{1,3}$/).default("600+5"),
  rounds: z.number().int().min(1).max(9).default(3),
  active: z.boolean().default(true),
});

/**
 * Never schedule into the past; roll forward a week until it is ahead —
 * in the club's own timezone, so a clock change does not move the hour.
 */
function notInThePast(when: Date, timeZone: string): Date {
  let next = new Date(when);
  for (let i = 0; i < 60 && next.getTime() <= Date.now(); i++) {
    next = addWeekLocal(next, timeZone);
  }
  return next;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireUser();
  const { slug } = await params;

  const club = await prisma.club.findUnique({
    where: { slug },
    select: { id: true, timezone: true },
  });
  if (!club) return NextResponse.json({ error: "no_such_club" }, { status: 404 });

  const member = await prisma.membership.findFirst({
    where: { userId, clubId: club.id, active: true },
    select: { role: true },
  });
  if (!canRunCompetitions(member?.role)) {
    return NextResponse.json({ error: "organizers_only" }, { status: 403 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    const issue = e instanceof z.ZodError ? e.issues[0] : null;
    return NextResponse.json(
      { error: issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid" },
      { status: 400 },
    );
  }

  const startsAt = notInThePast(new Date(body.startsAt), club.timezone || DEFAULT_TZ);

  const existing = await prisma.clubNight.findFirst({ where: { clubId: club.id } });

  // A night in progress keeps its start time; changing it underneath a
  // live tournament would strand the pairings.
  if (existing?.state === "LIVE") {
    return NextResponse.json({ error: "night_in_progress" }, { status: 409 });
  }

  const night = existing
    ? await prisma.clubNight.update({
        where: { id: existing.id },
        data: {
          dayOfWeek: body.dayOfWeek,
          startsAt,
          timeControl: body.timeControl,
          rounds: body.rounds,
          active: body.active,
        },
      })
    : await prisma.clubNight.create({
        data: {
          clubId: club.id,
          dayOfWeek: body.dayOfWeek,
          startsAt,
          timeControl: body.timeControl,
          rounds: body.rounds,
          active: body.active,
        },
      });

  return NextResponse.json(
    { id: night.id, startsAt: night.startsAt, active: night.active },
    { status: existing ? 200 : 201 },
  );
}

/** Stop the weekly night without deleting its history. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireUser();
  const { slug } = await params;

  const club = await prisma.club.findUnique({ where: { slug }, select: { id: true } });
  if (!club) return NextResponse.json({ error: "no_such_club" }, { status: 404 });

  const member = await prisma.membership.findFirst({
    where: { userId, clubId: club.id, active: true },
    select: { role: true },
  });
  if (!canRunCompetitions(member?.role)) {
    return NextResponse.json({ error: "organizers_only" }, { status: 403 });
  }

  await prisma.clubNight.updateMany({
    where: { clubId: club.id, state: { not: "LIVE" } },
    data: { active: false },
  });
  return NextResponse.json({ ok: true });
}
