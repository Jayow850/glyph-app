import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Lightweight poll: what's the current position? */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await prisma.liveGame.findUnique({
    where: { id },
    select: { fen: true, sans: true, status: true, result: true },
  });
  if (!game) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(game);
}