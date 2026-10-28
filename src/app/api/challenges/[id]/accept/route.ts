import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { parseTimeControl } from "@/lib/game-clock";
import { classify, parseId } from "@engine/game/timeControls";

/**
 * Accepting a challenge creates the LiveGame both players will play in.
 *
 * Two kinds arrive here: a directed challenge, which only its recipient
 * may take, and an open seek posted to a club, which any member may —
 * and that second kind is a race. Two people tapping the same seek a
 * moment apart must produce one game, not two, so the status check and
 * the claim are a single conditional write rather than a read followed
 * by a write.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  const challenge = await prisma.challenge.findUnique({ where: { id } });
  if (!challenge) {
    return NextResponse.json({ error: "no_such_challenge" }, { status: 404 });
  }
  if (challenge.status !== "pending") {
    return NextResponse.json({ error: "already_handled" }, { status: 409 });
  }

  const isOpen = challenge.toId === null;

  if (isOpen) {
    if (challenge.fromId === userId) {
      return NextResponse.json({ error: "your_own_seek" }, { status: 400 });
    }
    if (challenge.expiresAt && challenge.expiresAt.getTime() <= Date.now()) {
      await prisma.challenge.updateMany({
        where: { id, status: "pending" },
        data: { status: "expired" },
      });
      return NextResponse.json({ error: "expired" }, { status: 410 });
    }
    if (challenge.clubId) {
      const member = await prisma.membership.findFirst({
        where: { userId, clubId: challenge.clubId, active: true },
      });
      if (!member) {
        return NextResponse.json({ error: "not_a_member" }, { status: 403 });
      }
    }
  } else if (challenge.toId !== userId) {
    return NextResponse.json({ error: "not_yours" }, { status: 403 });
  }

  // Claim it. The status guard lives inside the write, so whoever loses
  // the race gets count === 0 rather than a second game.
  const claimed = await prisma.challenge.updateMany({
    where: { id, status: "pending" },
    data: { status: "accepted", toId: userId },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "already_handled" }, { status: 409 });
  }

  // Decide colours: the challenger's preference, or a coin flip.
  const challengerIsWhite =
    challenge.color === "white" ? true
    : challenge.color === "black" ? false
    : Math.random() < 0.5;

  const whiteId = challengerIsWhite ? challenge.fromId : userId;
  const blackId = challengerIsWhite ? userId : challenge.fromId;

  const { initialMs, incrementMs } = parseTimeControl(challenge.timeControl);
  const { base, increment } = parseId(challenge.timeControl);

  const game = await prisma.liveGame.create({
    data: {
      whiteId,
      blackId,
      rated: challenge.rated,
      timeControl: challenge.timeControl,
      category: classify(base, increment),
      whiteMs: initialMs,
      blackMs: initialMs,
      incrementMs,
      lastMoveAt: new Date(),
      // Nothing ticks until White actually plays. Two players who open
      // the game ten minutes apart should still get a fair clock.
      clockStarted: false,
    },
  });

  await prisma.challenge.update({
    where: { id },
    data: { liveGameId: game.id },
  });

  return NextResponse.json({ gameId: game.id, whiteId, blackId });
}
