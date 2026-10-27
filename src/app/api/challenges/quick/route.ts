import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { classify, parseId } from "@engine/game/timeControls";
import { getOrCreateRating } from "@/lib/services/ratings";

const Body = z.object({
  timeControl: z.string().regex(/^\d{1,5}\+\d{1,3}$/),
  rated: z.boolean().default(true),
  color: z.enum(["white", "black", "random"]).default("random"),
});

/**
 * Quick play — one tap to a game.
 *
 * A true pairing pool needs open seeks, which the schema can't hold yet
 * (Challenge.toId is required). Until then this does the thing a club
 * player actually wants: find the member closest to my strength who I'm
 * not already waiting on, and challenge them. No form, no picker.
 */
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const { timeControl, rated, color } = Body.parse(await req.json());

  const { base, increment } = parseId(timeControl);
  const category = classify(base, increment);

  const myClubs = await prisma.membership.findMany({
    where: { userId, active: true },
    select: { clubId: true },
  });

  // Prefer club-mates; fall back to anyone on the platform so a member
  // of no club still gets a game.
  const pool = myClubs.length
    ? await prisma.membership.findMany({
        where: { clubId: { in: myClubs.map((m) => m.clubId) }, userId: { not: userId }, active: true },
        select: { userId: true },
        take: 200,
      }).then((rows) => [...new Set(rows.map((r) => r.userId))])
    : await prisma.user
        .findMany({ where: { id: { not: userId }, bannedAt: null }, select: { id: true }, take: 200 })
        .then((rows) => rows.map((r) => r.id));

  if (pool.length === 0) {
    return NextResponse.json({ error: "nobody_available" }, { status: 404 });
  }

  // Anyone already in a pending challenge with me is out.
  const open = await prisma.challenge.findMany({
    where: {
      status: "pending",
      OR: [{ fromId: userId, toId: { in: pool } }, { toId: userId, fromId: { in: pool } }],
    },
    select: { fromId: true, toId: true },
  });
  const busy = new Set(open.flatMap((c) => [c.fromId, c.toId]));

  const candidates = pool.filter((id) => !busy.has(id));
  if (candidates.length === 0) {
    return NextResponse.json({ error: "all_busy" }, { status: 409 });
  }

  const mine = await getOrCreateRating(userId, category);
  const theirs = await prisma.glyphRating.findMany({
    where: { userId: { in: candidates }, category },
    select: { userId: true, rating: true },
  });
  const ratingOf = new Map(theirs.map((r) => [r.userId, r.rating]));

  // Closest in strength wins. Unrated players sit at the default, which
  // naturally pairs newcomers with newcomers.
  const opponentId = candidates
    .map((id) => ({ id, gap: Math.abs((ratingOf.get(id) ?? 1200) - mine.rating) }))
    .sort((a, b) => a.gap - b.gap)[0].id;

  const challenge = await prisma.challenge.create({
    data: { fromId: userId, toId: opponentId, timeControl, rated, color, status: "pending" },
  });

  const opponent = await prisma.profile.findUnique({
    where: { userId: opponentId },
    select: { fullName: true, handle: true },
  });

  return NextResponse.json(
    {
      id: challenge.id,
      opponent: opponent?.fullName ?? opponent?.handle ?? "a player",
      gap: Math.round(Math.abs((ratingOf.get(opponentId) ?? 1200) - mine.rating)),
    },
    { status: 201 },
  );
}
