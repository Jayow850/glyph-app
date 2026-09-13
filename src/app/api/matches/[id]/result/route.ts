import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { memberRole, can } from "@/lib/rbac";
import { submitResult } from "@/lib/services/results";

const Body = z.object({
  result: z.enum(["WHITE_WIN", "BLACK_WIN", "DRAW", "WHITE_FORFEIT", "BLACK_FORFEIT", "DOUBLE_FORFEIT"]),
  clientTimestamp: z.string().datetime().optional(), // offline-queued submissions
  pgn: z.string().max(20000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const body = Body.parse(await req.json());

  const match = await prisma.match.findUniqueOrThrow({
    where: { id },
    include: { round: { include: { tournament: true } } },
  });
  const role = await memberRole(userId, match.round.tournament.clubId);

  const res = await submitResult({
    matchId: id,
    submitterId: userId,
    result: body.result,
    isOfficial: can.ruleDisputes(role),
    clientTimestamp: body.clientTimestamp ? new Date(body.clientTimestamp) : undefined,
    pgn: body.pgn,
  });
  return NextResponse.json(res);
}
