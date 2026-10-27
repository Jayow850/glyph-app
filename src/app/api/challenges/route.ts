import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { classify, parseId } from "@engine/game/timeControls";

const Body = z.object({
  toId: z.string().min(1),
  /** "<base seconds>+<increment seconds>", e.g. "600+0". */
  timeControl: z.string().regex(/^\d{1,5}\+\d{1,3}$/),
  color: z.enum(["white", "black", "random"]).default("random"),
  rated: z.boolean().default(true),
  message: z.string().max(140).optional(),
});

/** Send a challenge. */
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const body = Body.parse(await req.json());

  if (body.toId === userId) {
    return NextResponse.json({ error: "cannot_challenge_yourself" }, { status: 400 });
  }

  const { base, increment } = parseId(body.timeControl);
  if (base < 15 || base > 10_800 || increment > 180) {
    return NextResponse.json({ error: "bad_time_control" }, { status: 400 });
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
    data: {
      fromId: userId,
      toId: body.toId,
      timeControl: body.timeControl,
      color: body.color,
      rated: body.rated,
      message: body.message?.trim() || null,
      status: "pending",
    },
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
