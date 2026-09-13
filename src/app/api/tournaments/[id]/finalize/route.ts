import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireRole, can } from "@/lib/rbac";
import { finalizeTournament } from "@/lib/services/tournament";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id } });
  await requireRole(userId, t.clubId, can.runTournaments);
  const table = await finalizeTournament(id);
  return NextResponse.json(table);
}
