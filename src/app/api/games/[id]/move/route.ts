import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { Engine } from "@engine/game/engine";
import { readClocks, timeoutOutcome } from "@/lib/game-clock";
import { settleIfFinished } from "@/lib/services/ratings";

const gridToX88 = (i: number) => (7 - Math.floor(i / 8)) * 16 + (i % 8);

const Body = z.object({
  from: z.number().int().min(0).max(63),
  to: z.number().int().min(0).max(63),
  promotion: z.string().optional(),
  /** Move number the client believes it is playing — rejects replays. */
  seq: z.number().int().min(0).optional(),
});

/**
 * The server is the judge. It loads the position from the database,
 * runs its own engine, and only accepts a move the engine says is legal.
 * The client's opinion is irrelevant.
 *
 * Time is settled here too: the mover is charged the real elapsed time
 * from the server's own timestamps, and a flag that fell before the move
 * arrived beats the move. White's first move is free — the clock has
 * not started yet.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const { from, to, promotion, seq } = Body.parse(await req.json());

  const game = await prisma.liveGame.findUniqueOrThrow({ where: { id } });
  if (game.status !== "ACTIVE") {
    return NextResponse.json({ error: "game_over" }, { status: 409 });
  }

  const yourColour = game.whiteId === userId ? "w" : game.blackId === userId ? "b" : null;
  if (!yourColour) return NextResponse.json({ error: "not_a_player" }, { status: 403 });

  const engine = new Engine(game.fen);
  if (engine.turn !== yourColour) {
    return NextResponse.json({ error: "not_your_turn" }, { status: 409 });
  }

  // Replay guard: a duplicate submission carries a stale move number.
  if (seq !== undefined && seq !== game.sans.length) {
    return NextResponse.json({ error: "stale_seq" }, { status: 409 });
  }

  // Did the clock run out before this move reached us? The flag wins.
  // (readClocks returns the stored balances untouched while the game is
  // still waiting for White, so this cannot fire on move one.)
  const clocks = readClocks(game);
  if (clocks.flagged) {
    const { result, endReason } = timeoutOutcome(game.fen);
    const flagged = await prisma.liveGame.update({
      where: { id },
      data: {
        status: "FINISHED",
        result,
        endReason,
        whiteMs: clocks.whiteMs,
        blackMs: clocks.blackMs,
        drawOfferBy: null,
      },
    });
    await settleIfFinished(id, flagged.status);
    return NextResponse.json(
      {
        error: "flagged",
        fen: flagged.fen,
        sans: flagged.sans,
        status: flagged.status,
        result: flagged.result,
        endReason: flagged.endReason,
        whiteMs: flagged.whiteMs,
        blackMs: flagged.blackMs,
      },
      { status: 409 },
    );
  }

  // The engine decides. If it returns null, the move was illegal.
  const move = engine.move(gridToX88(from), gridToX88(to), promotion ?? "q");
  if (!move) return NextResponse.json({ error: "illegal_move" }, { status: 400 });

  // Charge the mover their thinking time, then pay the increment.
  const remaining = yourColour === "w" ? clocks.whiteMs : clocks.blackMs;
  const afterMove = remaining + game.incrementMs;

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
      lastMoveAt: new Date(),
      clockStarted: true,
      drawOfferBy: null, // any move withdraws a pending offer
      ...(yourColour === "w" ? { whiteMs: afterMove } : { blackMs: afterMove }),
    },
  });

  await settleIfFinished(id, updated.status);

  return NextResponse.json({
    fen: updated.fen,
    sans: updated.sans,
    status: updated.status,
    result: updated.result,
    endReason: updated.endReason,
    whiteMs: updated.whiteMs,
    blackMs: updated.blackMs,
    turn: engine.turn,
    drawOfferBy: null,
    ticking: true,
  });
}
