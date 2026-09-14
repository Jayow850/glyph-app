import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireRole, can } from "@/lib/rbac";
import { assertWithinLimits } from "@/lib/limits";

const CreateTournament = z.object({
  clubId: z.string(),
  name: z.string().min(2).max(120),
  format: z.enum(["SWISS", "ROUND_ROBIN", "KNOCKOUT", "TEAM_SWISS", "LADDER", "SIMUL"]).default("SWISS"),
  timeControl: z.enum(["CLASSICAL", "RAPID", "BLITZ", "BULLET"]).default("RAPID"),
  timeControlDetail: z.string().optional(),
  totalRounds: z.number().int().min(1).max(15).default(5),
  isRated: z.boolean().default(true),
  kFactorOverride: z.number().int().min(10).max(60).nullable().optional(),
  maxPlayers: z.number().int().positive().optional(),
  entryFeeCents: z.number().int().min(0).default(0),
  startsAt: z.string().datetime().optional(),
  location: z.string().optional(),
  tiebreakOrder: z.array(z.enum(["BUCHHOLZ", "BUCHHOLZ_CUT1", "SONNEBORN_BERGER", "DIRECT_ENCOUNTER", "CUMULATIVE", "WINS"])).optional(),
});

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const body = CreateTournament.parse(await req.json());
  await requireRole(userId, body.clubId, can.runTournaments);
  await assertWithinLimits(body.clubId, "tournament");

  const t = await prisma.tournament.create({
    data: {
      ...body,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      status: "REGISTRATION",
      chatRoom: { create: { clubId: body.clubId, name: `${body.name} — chat` } },
    },
  });
  return NextResponse.json(t, { status: 201 });
}
