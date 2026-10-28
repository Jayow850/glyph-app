import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { COUNTDOWN_MS } from "@/lib/services/clubnight";

const Body = z.object({
  state: z.enum(["GOING", "MAYBE", "OUT"]),
  /** Sent when the member is actually in the room, at start time. */
  checkIn: z.boolean().optional(),
});

/**
 * RSVP, and check in.
 *
 * Two different facts, deliberately on one row: an RSVP is an
 * intention days in advance, a check-in is "I am here now". Pairing
 * uses the second, because pairing the first seats people who never
 * turned up and hands half the room a bye against a ghost.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  const night = await prisma.clubNight.findUnique({
    where: { id },
    select: { id: true, clubId: true, state: true, startsAt: true },
  });
  if (!night) return NextResponse.json({ error: "no_such_club_night" }, { status: 404 });

  const member = await prisma.membership.findFirst({
    where: { userId, clubId: night.clubId, active: true },
  });
  if (!member) return NextResponse.json({ error: "not_a_member" }, { status: 403 });

  const body = Body.parse(await req.json());

  // Checking in only means anything near the start time.
  const near = night.startsAt.getTime() - Date.now() <= COUNTDOWN_MS;
  const checkedInAt = body.checkIn && near && body.state === "GOING" ? new Date() : undefined;

  await prisma.clubNightRsvp.upsert({
    where: { clubNightId_userId: { clubNightId: id, userId } },
    create: { clubNightId: id, userId, state: body.state, checkedInAt },
    update: { state: body.state, ...(checkedInAt ? { checkedInAt } : {}) },
  });

  const going = await prisma.clubNightRsvp.count({ where: { clubNightId: id, state: "GOING" } });
  return NextResponse.json({ ok: true, state: body.state, going, checkedIn: Boolean(checkedInAt) });
}
