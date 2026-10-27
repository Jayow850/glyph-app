import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { readClocks } from "@/lib/game-clock";
import { gameStatePayload } from "@/lib/game-state";
import { settleIfFinished } from "@/lib/services/ratings";

const Body = z.object({ action: z.enum(["offer", "accept", "decline"]) });

/**
 * Draw negotiation. An offer sits on the game until the opponent
 * answers it, a move is played, or the offerer withdraws it. Offering
 * into a standing offer from the other side is the same as accepting.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const { action } = Body.parse(await req.json());

  const game = await prisma.liveGame.findUniqueOrThrow({ where: { id } });
  if (game.status !== "ACTIVE") {
    return NextResponse.json({ error: "game_over" }, { status: 409 });
  }

  const yourColour = game.whiteId === userId ? "w" : game.blackId === userId ? "b" : null;
  if (!yourColour) return NextResponse.json({ error: "not_a_player" }, { status: 403 });

  const standing = game.drawOfferBy;
  const theirOffer = standing !== null && standing !== yourColour;

  if (action === "accept" && !theirOffer) {
    return NextResponse.json({ error: "no_offer" }, { status: 409 });
  }

  const agree = (action === "accept" || action === "offer") && theirOffer;

  interface DrawUpdate {
    status?: "FINISHED";
    result?: string;
    endReason?: string;
    whiteMs?: number;
    blackMs?: number;
    drawOfferBy: string | null;
  }

  const clocks = readClocks(game);
  const data: DrawUpdate = agree
    ? {
        status: "FINISHED",
        result: "1/2-1/2",
        endReason: "draw_agreed",
        whiteMs: clocks.whiteMs,
        blackMs: clocks.blackMs,
        drawOfferBy: null,
      }
    : action === "offer"
    ? { drawOfferBy: yourColour }
    // decline, or withdraw your own standing offer
    : { drawOfferBy: null };

  await prisma.liveGame.update({ where: { id }, data });
  if (agree) await settleIfFinished(id, "FINISHED");

  return NextResponse.json(await gameStatePayload(id));
}
