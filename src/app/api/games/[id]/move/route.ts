import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { Engine } from "../../../../../../lib/game/engine";

const gridToX88 = (i: number) => (7 - Math.floor(i / 8)) * 16 + (i % 8);

const Body = z.object({
  from: z.number().int().min(0).max(63),
  to: z.number().int().min(0).max(63),
  promotion: z.string().optional(),
});

/**
 * The server is the judge. It loads the position from the database,
 * runs its own engine, and only accepts a move the engine says is legal.
 * The client's opinion is irrelevant.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const { from, to, promotion } = Body.parse(await req.json());

  const game = await prisma.liveGame.findUniqueOrThrow({ where: { id } });
  if (game.status !== "ACTIVE") {
    return NextResponse.json({ error: "game_over" }, { status: 409 });
  }

  // Who are you, and is it your turn?
  const yourColour = game.whiteId === userId ? "w" : game.blackId === userId ? "b" : null;
  if (!yourColour) return NextResponse.json({ error: "not_a_player" }, { status: 403 });

  const engine = new Engine(game.fen);
  if (engine.turn !== yourColour) {
    return NextResponse.json({ error: "not_your_turn" }, { status: 409 });
  }

  // The engine decides. If it returns null, the move was illegal.
  const move = engine.move(gridToX88(from), gridToX88(to), promotion ?? "q");
  if (!move) return NextResponse.json({ error: "illegal_move" }, { status: 400 });

  // Did that end the game?
  const outcome = engine.status();
  let status: "ACTIVE" | "FINISHED" = "ACTIVE";
  let result: string | null = null;
  let endReason: string | null = null;

  if (outcome === "checkmate") {
    status = "FINISHED";
    result = engine.turn === "w" ? "0-1" : "1-0"; // side to move is checkmated
    endReason = "checkmate";
  } else if (outcome !== "active") {
    status = "FINISHED";
    result = "1/2-1/2";
    endReason = outcome;
  }

  const updated = await prisma.liveGame.update({
    where: { id },
    data: {
      fen: engine.fen(),
      sans: { push: move.san ?? "?" },
      status,
      result,
      endReason,
    },
  });

  return NextResponse.json({ fen: updated.fen, sans: updated.sans, status: updated.status, result: updated.result });
}