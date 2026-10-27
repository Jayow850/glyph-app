import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { parseTimeControl } from "@/lib/game-clock";
import { classify, parseId } from "@engine/game/timeControls";

/** Accepting a challenge creates the LiveGame both players will play in. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  const challenge = await prisma.challenge.findUniqueOrThrow({ where: { id } });
  if (challenge.toId !== userId) {
    return NextResponse.json({ error: "not_yours" }, { status: 403 });
  }
  if (challenge.status !== "pending") {
    return NextResponse.json({ error: "already_handled" }, { status: 409 });
  }

  // Decide colours: the challenger's preference, or a coin flip.
  const challengerIsWhite =
    challenge.color === "white" ? true
    : challenge.color === "black" ? false
    : Math.random() < 0.5;

  const whiteId = challengerIsWhite ? challenge.fromId : challenge.toId;
  const blackId = challengerIsWhite ? challenge.toId : challenge.fromId;

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
    data: { status: "accepted", liveGameId: game.id },
  });

  return NextResponse.json({ gameId: game.id, whiteId, blackId });
}
