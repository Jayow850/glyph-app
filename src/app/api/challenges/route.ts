import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { classify, parseId } from "@engine/game/timeControls";

/** How long an unanswered open seek stays on the club board. */
const SEEK_MINUTES = 20;

const Body = z.object({
  /** Omit to post an open seek any club member may take. */
  toId: z.string().min(1).optional(),
  /** Which club the seek goes to. Defaults to your oldest membership. */
  clubId: z.string().min(1).optional(),
  /** "<base seconds>+<increment seconds>", e.g. "600+0". */
  timeControl: z.string().regex(/^\d{1,5}\+\d{1,3}$/),
  color: z.enum(["white", "black", "random"]).default("random"),
  rated: z.boolean().default(true),
  message: z.string().max(140).optional(),
});

/** Send a challenge, or post an open seek to your club. */
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const body = Body.parse(await req.json());

  const { base, increment } = parseId(body.timeControl);
  if (base < 15 || base > 10_800 || increment > 180) {
    return NextResponse.json({ error: "bad_time_control" }, { status: 400 });
  }

  const common = {
    fromId: userId,
    timeControl: body.timeControl,
    color: body.color,
    rated: body.rated,
    message: body.message?.trim() || null,
    status: "pending",
  };

  // ---- An open seek: posted to a club, not to a person ---------------
  if (!body.toId) {
    // Membership is the whole point of a club board — a seek nobody in
    // the room can see is just a timer.
    const membership = body.clubId
      ? await prisma.membership.findFirst({ where: { userId, clubId: body.clubId, active: true } })
      : await prisma.membership.findFirst({ where: { userId, active: true }, orderBy: { joinedAt: "asc" } });

    if (!membership) {
      return NextResponse.json({ error: "no_club" }, { status: 400 });
    }

    // One live seek per club per time control. Tapping twice should not
    // put two of your own games on the board.
    const existing = await prisma.challenge.findFirst({
      where: {
        fromId: userId, toId: null, status: "pending",
        clubId: membership.clubId, timeControl: body.timeControl,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (existing) return NextResponse.json({ id: existing.id, duplicate: true, open: true });

    const seek = await prisma.challenge.create({
      data: {
        ...common,
        toId: null,
        clubId: membership.clubId,
        expiresAt: new Date(Date.now() + SEEK_MINUTES * 60_000),
      },
    });

    return NextResponse.json(
      { id: seek.id, open: true, expiresAt: seek.expiresAt, category: classify(base, increment) },
      { status: 201 },
    );
  }

  // ---- A challenge aimed at one person -------------------------------
  if (body.toId === userId) {
    return NextResponse.json({ error: "cannot_challenge_yourself" }, { status: 400 });
  }

  const opponent = await prisma.user.findUnique({ where: { id: body.toId } });
  if (!opponent || opponent.bannedAt) {
    return NextResponse.json({ error: "no_such_player" }, { status: 404 });
  }

  // One live challenge per pairing at a time — repeated taps on a slow
  // connection should not fill the opponent's inbox.
  const existing = await prisma.challenge.findFirst({
    where: { fromId: userId, toId: body.toId, status: "pending" },
  });
  if (existing) return NextResponse.json({ id: existing.id, duplicate: true }, { status: 200 });

  const challenge = await prisma.challenge.create({
    data: { ...common, toId: body.toId },
  });

  return NextResponse.json(
    { id: challenge.id, category: classify(base, increment) },
    { status: 201 },
  );
}

/** Challenges waiting on you, newest first. */
export async function GET() {
  const userId = await requireUser();
  const challenges = await prisma.challenge.findMany({
    where: { toId: userId, status: "pending" },
    include: { from: { include: { profile: true } } },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return NextResponse.json({ challenges });
}
