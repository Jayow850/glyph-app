import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireRole, can } from "@/lib/rbac";
import { pairNextRound } from "@/lib/services/tournament";
import { redisPub } from "@/lib/redis";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const t = await prisma.tournament.findUniqueOrThrow({ where: { id } });
  await requireRole(userId, t.clubId, can.runTournaments);

  const round = await pairNextRound(id);
  await prisma.auditLog.create({
    data: { userId, clubId: t.clubId, action: "ROUND_PAIRED", entity: "Tournament", entityId: id, metadata: { round: round.number } },
  });
  await redisPub.publish(`tournament:${id}`, JSON.stringify({ event: "pairings", round: round.number }));
  return NextResponse.json(round, { status: 201 });
}
