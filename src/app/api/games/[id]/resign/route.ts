import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { readClocks } from "@/lib/game-clock";
import { gameStatePayload } from "@/lib/game-state";
import { settleIfFinished } from "@/lib/services/ratings";

/** Resignation. Immediate, unilateral, and final. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  const game = await prisma.liveGame.findUniqueOrThrow({ where: { id } });
  if (game.status !== "ACTIVE") {
    return NextResponse.json({ error: "game_over" }, { status: 409 });
  }

  const yourColour = game.whiteId === userId ? "w" : game.blackId === userId ? "b" : null;
  if (!yourColour) return NextResponse.json({ error: "not_a_player" }, { status: 403 });

  const clocks = readClocks(game);

  await prisma.liveGame.update({
    where: { id },
    data: {
      status: "FINISHED",
      result: yourColour === "w" ? "0-1" : "1-0",
      endReason: "resign",
      whiteMs: clocks.whiteMs,
      blackMs: clocks.blackMs,
      drawOfferBy: null,
    },
  });

  await settleIfFinished(id, "FINISHED");
  return NextResponse.json(await gameStatePayload(id));
}
