import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireRole, can } from "@/lib/rbac";
import { ruleDispute } from "@/lib/services/results";

const Ruling = z.object({
  result: z.enum(["WHITE_WIN", "BLACK_WIN", "DRAW", "WHITE_FORFEIT", "BLACK_FORFEIT", "DOUBLE_FORFEIT"]),
  ruling: z.string().min(5).max(2000),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const body = Ruling.parse(await req.json());

  const match = await prisma.match.findUniqueOrThrow({
    where: { id },
    include: { round: { include: { tournament: true } } },
  });
  await requireRole(userId, match.round.tournament.clubId, can.ruleDisputes);

  const res = await ruleDispute({ matchId: id, arbiterId: userId, ...body });
  return NextResponse.json(res);
}
