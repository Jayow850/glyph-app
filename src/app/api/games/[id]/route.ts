import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

/** REST fallback for resync + finished-game fetch ("Post this game" pulls the PGN here). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await prisma.game.findUniqueOrThrow({
    where: { id },
    include: { white: { include: { profile: true } }, black: { include: { profile: true } } },
  });
  const live = game.status === "ACTIVE" ? JSON.parse((await redis.get(`game:${id}:snap`)) ?? "null") : null;
  return NextResponse.json({ game, live });
}
