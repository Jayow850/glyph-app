import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const Body = z.object({
  body: z.string().trim().min(1).max(300),
  kind: z.enum(["CHAT", "QUICK"]).default("CHAT"),
});

async function assertParticipant(gameId: string, userId: string) {
  const game = await prisma.liveGame.findUniqueOrThrow({
    where: { id: gameId },
    select: { whiteId: true, blackId: true },
  });
  return game.whiteId === userId || game.blackId === userId;
}

/** The thread for one game. Spectators can read it; only players write. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const messages = await prisma.gameMessage.findMany({
    where: { gameId: id },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: { user: { include: { profile: true } } },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.profile?.fullName ?? m.user.profile?.handle ?? "Player",
      body: m.body,
      kind: m.kind,
      at: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const { body, kind } = Body.parse(await req.json());

  if (!(await assertParticipant(id, userId))) {
    return NextResponse.json({ error: "not_a_player" }, { status: 403 });
  }

  // A player who floods the board loses the privilege for a minute.
  const recent = await prisma.gameMessage.count({
    where: { gameId: id, userId, createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (recent >= 20) {
    return NextResponse.json({ error: "slow_down" }, { status: 429 });
  }

  await prisma.gameMessage.create({ data: { gameId: id, userId, body, kind } });
  return NextResponse.json({ ok: true }, { status: 201 });
}
