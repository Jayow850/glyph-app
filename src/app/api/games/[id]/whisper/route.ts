import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/**
 * The whisper layer — the rail talking about the game while the players
 * concentrate.
 *
 * The rule that makes it work: during play the thread is invisible to
 * the two people playing. That is not a nicety, it is the whole design.
 * A spectator who knows a player can read along writes for the player;
 * a spectator who knows they cannot writes what they actually think.
 *
 * When the game ends the thread opens to both players, and reading what
 * the room said about your game while you were in it is the part no
 * chess app has ever given anyone.
 *
 * The hiding is enforced here, not in the client. A thread that is
 * merely not rendered is a thread that is one devtools tab away from
 * being read, and a player who found it that way would be right to
 * stop trusting the feature.
 */

const Body = z.object({ body: z.string().trim().min(1).max(300) });

async function context(gameId: string, userId: string | null) {
  const game = await prisma.liveGame.findUnique({
    where: { id: gameId },
    select: { whiteId: true, blackId: true, status: true },
  });
  if (!game) return null;
  const isPlayer = userId === game.whiteId || userId === game.blackId;
  return { game, isPlayer, finished: game.status !== "ACTIVE" };
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;
  const { id } = await params;

  const ctx = await context(id, userId);
  if (!ctx) return NextResponse.json({ error: "no_such_game" }, { status: 404 });

  // Sealed while the game is live, for the two people in it.
  if (ctx.isPlayer && !ctx.finished) {
    return NextResponse.json({ sealed: true, whispers: [], canWrite: false });
  }
  if (!userId) {
    return NextResponse.json({ sealed: true, whispers: [], canWrite: false });
  }

  const whispers = await prisma.whisper.findMany({
    where: { liveGameId: id },
    include: { user: { include: { profile: true } } },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return NextResponse.json({
    sealed: false,
    revealed: ctx.isPlayer && ctx.finished,
    canWrite: !ctx.isPlayer && !ctx.finished,
    whispers: whispers.map((w) => ({
      id: w.id,
      userId: w.userId,
      name: w.user.profile?.fullName ?? "A member",
      country: w.user.profile?.country ?? null,
      body: w.body,
      at: w.createdAt.getTime(),
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "sign_in" }, { status: 401 });

  const { id } = await params;
  const ctx = await context(id, userId);
  if (!ctx) return NextResponse.json({ error: "no_such_game" }, { status: 404 });

  if (ctx.isPlayer) {
    return NextResponse.json({ error: "players_cannot_whisper" }, { status: 403 });
  }
  if (ctx.finished) {
    // Once it is revealed it is a record, not a conversation.
    return NextResponse.json({ error: "game_over" }, { status: 409 });
  }

  const { body } = Body.parse(await req.json());
  const whisper = await prisma.whisper.create({
    data: { liveGameId: id, userId, body },
  });

  return NextResponse.json({ id: whisper.id, at: whisper.createdAt.getTime() });
}
