import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { nextOccurrence } from "@/lib/services/clubnight";

const Body = z.object({
  /** 0 = Sunday. */
  dayOfWeek: z.number().int().min(0).max(6),
  /** "19:30" local to whoever set it. */
  time: z.string().regex(/^\d{1,2}:\d{2}$/),
  timeControl: z.string().regex(/^\d{1,5}\+\d{1,3}$/).default("600+5"),
  rounds: z.number().int().min(1).max(9).default(3),
  active: z.boolean().default(true),
});

/** Set the club's weekly slot. One per club: it is a rhythm, not a calendar. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireUser();
  const { slug } = await params;

  const club = await prisma.club.findUnique({ where: { slug }, select: { id: true } });
  if (!club) return NextResponse.json({ error: "no_such_club" }, { status: 404 });

  const member = await prisma.membership.findFirst({
    where: { userId, clubId: club.id, active: true },
    select: { role: true },
  });
  if (!member || !["OWNER", "ADMIN", "ORGANIZER"].includes(member.role)) {
    return NextResponse.json({ error: "organizers_only" }, { status: 403 });
  }

  const body = Body.parse(await req.json());
  const [hh, mm] = body.time.split(":").map(Number);

  // Anchor on the next matching weekday at that time, then let
  // nextOccurrence roll it forward from there, week after week.
  const anchor = new Date();
  anchor.setSeconds(0, 0);
  anchor.setHours(hh, mm);
  while (anchor.getDay() !== body.dayOfWeek || anchor.getTime() <= Date.now()) {
    anchor.setDate(anchor.getDate() + 1);
  }

  const existing = await prisma.clubNight.findFirst({ where: { clubId: club.id } });
  const night = existing
    ? await prisma.clubNight.update({
        where: { id: existing.id },
        data: {
          dayOfWeek: body.dayOfWeek,
          startsAt: nextOccurrence(new Date(), anchor),
          timeControl: body.timeControl,
          rounds: body.rounds,
          active: body.active,
        },
      })
    : await prisma.clubNight.create({
        data: {
          clubId: club.id,
          dayOfWeek: body.dayOfWeek,
          startsAt: anchor,
          timeControl: body.timeControl,
          rounds: body.rounds,
          active: body.active,
        },
      });

  return NextResponse.json({ id: night.id, startsAt: night.startsAt }, { status: existing ? 200 : 201 });
}
