import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { gameStatePayload } from "@/lib/game-state";

/**
 * Abort — the escape hatch for a game that never started.
 *
 * Allowed while fewer than two ply have been played, which is the same
 * window Lichess and Chess.com use. Nothing is rated, nobody is
 * penalised: an opponent who never turned up should not cost you a
 * rating point, and you should not be able to abandon a real game by
 * calling it an abort.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  const game = await prisma.liveGame.findUniqueOrThrow({ where: { id } });
  if (game.status !== "ACTIVE") {
    return NextResponse.json({ error: "game_over" }, { status: 409 });
  }
  if (game.whiteId !== userId && game.blackId !== userId) {
    return NextResponse.json({ error: "not_a_player" }, { status: 403 });
  }
  if (game.sans.length >= 2) {
    return NextResponse.json({ error: "too_late_to_abort" }, { status: 409 });
  }

  await prisma.liveGame.update({
    where: { id },
    data: { status: "ABORTED", result: null, endReason: "aborted", drawOfferBy: null },
  });

  return NextResponse.json(await gameStatePayload(id));
}
