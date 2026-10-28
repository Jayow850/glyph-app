import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/**
 * Offer a rematch: the same clock and stakes, colours swapped, sent to
 * the same opponent as an ordinary challenge so they still get to say
 * yes. If they have already offered you one, this accepts theirs
 * instead of stacking a second invitation.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  const game = await prisma.liveGame.findUniqueOrThrow({ where: { id } });
  if (game.status === "ACTIVE") {
    return NextResponse.json({ error: "still_playing" }, { status: 409 });
  }

  const youWereWhite = game.whiteId === userId;
  if (!youWereWhite && game.blackId !== userId) {
    return NextResponse.json({ error: "not_a_player" }, { status: 403 });
  }

  const opponentId = youWereWhite ? game.blackId : game.whiteId;

  // They beat you to it — take theirs.
  const theirs = await prisma.challenge.findFirst({
    where: { fromId: opponentId, toId: userId, status: "pending", timeControl: game.timeControl },
    orderBy: { createdAt: "desc" },
  });
  if (theirs) {
    return NextResponse.json({ challengeId: theirs.id, theirs: true });
  }

  const mine = await prisma.challenge.findFirst({
    where: { fromId: userId, toId: opponentId, status: "pending" },
  });
  if (mine) return NextResponse.json({ challengeId: mine.id, duplicate: true });

  const challenge = await prisma.challenge.create({
    data: {
      fromId: userId,
      toId: opponentId,
      timeControl: game.timeControl,
      rated: game.rated,
      // `color` is the challenger's colour, so asking for the opposite
      // of what you just had is what swaps the board.
      color: youWereWhite ? "black" : "white",
      message: "Rematch?",
      status: "pending",
      // A rematch offer is a handshake across a board that is still
      // warm. Left open it becomes a challenge arriving out of nowhere
      // an hour later, which is a different thing entirely.
      expiresAt: new Date(Date.now() + 60_000),
    },
  });

  return NextResponse.json({ challengeId: challenge.id }, { status: 201 });
}
