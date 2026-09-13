import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** The chess-native retention hook: your head-to-head record with another player. */
export async function GET(_: Request, { params }: { params: Promise<{ handle: string }> }) {
  const userId = await requireUser();
  const { handle } = await params;
  const other = await prisma.profile.findUniqueOrThrow({ where: { handle: handle.replace(/^@/, "") } });
  const [aId, bId] = [userId, other.userId].sort();
  const r = await prisma.rivalry.findUnique({ where: { aId_bId: { aId, bId } } });
  if (!r) return NextResponse.json({ played: 0, youWins: 0, themWins: 0, draws: 0, label: "First game awaits ♟" });
  const youAreA = aId === userId;
  const youWins = youAreA ? r.aWins : r.bWins;
  const themWins = youAreA ? r.bWins : r.aWins;
  const label = youWins > themWins ? `You lead ${youWins}–${themWins}` : youWins < themWins ? `You trail ${youWins}–${themWins}` : `All square ${youWins}–${themWins}`;
  return NextResponse.json({ played: youWins + themWins + r.draws, youWins, themWins, draws: r.draws, label });
}
