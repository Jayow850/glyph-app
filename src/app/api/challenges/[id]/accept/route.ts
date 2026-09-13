import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { GlyphGame } from "../../../../../../lib/game/server.ts";
import { registerGame } from "@/lib/realtime/socket-server";

/** Accept → authoritative game is born; both clients join `game:{id}`, clocks start. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const c = await prisma.challenge.findUniqueOrThrow({ where: { id } });
  if (c.toId !== userId) return NextResponse.json({ error: "not_yours" }, { status: 403 });
  if (c.status !== "pending") return NextResponse.json({ error: "already_handled" }, { status: 409 });

  const challengerWhite = c.color === "white" ? true : c.color === "black" ? false : Math.random() < 0.5;
  const whiteId = challengerWhite ? c.fromId : c.toId;
  const blackId = challengerWhite ? c.toId : c.fromId;
  const [secs, inc] = c.timeControl.split("+").map(Number);

  const game = await prisma.game.create({ data: { whiteId, blackId, rated: c.rated, timeControl: c.timeControl, threadId: c.gameId ?? undefined } });
  await prisma.challenge.update({ where: { id }, data: { status: "accepted", gameId: game.id } });
  await registerGame(new GlyphGame({ id: game.id, whiteId, blackId, initialMs: secs * 1000, incrementMs: inc * 1000, rated: c.rated }));
  return NextResponse.json({ gameId: game.id, whiteId, blackId, timeControl: c.timeControl });
}
