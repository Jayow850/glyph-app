import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canRunCompetitions } from "@/lib/services/officers";
import { createDivision, generateFixtures } from "@/lib/services/league";

const Body = z.object({
  half: z.enum(["AUTUMN", "SPRING"]),
  /** Named after someone who served the club, not numbered. */
  name: z.string().trim().min(2).max(60),
  tier: z.number().int().min(0).max(9),
  promoteCount: z.number().int().min(0).max(10).optional(),
  relegateCount: z.number().int().min(0).max(10).optional(),
  /** Allocate these members straight away, then build the fixtures. */
  userIds: z.array(z.string()).max(64).optional(),
  dueBy: z.string().datetime().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  const season = await prisma.season.findUnique({ where: { id }, select: { clubId: true } });
  if (!season) return NextResponse.json({ error: "no_such_season" }, { status: 404 });

  const member = await prisma.membership.findFirst({
    where: { userId, clubId: season.clubId, active: true },
    select: { role: true },
  });
  if (!canRunCompetitions(member?.role)) {
    return NextResponse.json({ error: "officers_only" }, { status: 403 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    const issue = e instanceof z.ZodError ? e.issues[0] : null;
    return NextResponse.json(
      { error: issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid" },
      { status: 400 },
    );
  }

  // userIds is the division's roster, so the movement counts can be
  // clamped to it on the way in rather than only at render.
  const division = await createDivision(id, { ...body, size: body.userIds?.length });

  // Members and fixtures in the same call: a division with no fixtures
  // is a list, and a list is not a league.
  if (body.userIds?.length) {
    await prisma.divisionMember.createMany({
      data: body.userIds.map((uid) => ({ divisionId: division.id, userId: uid })),
      skipDuplicates: true,
    });
    if (body.userIds.length >= 2) {
      await generateFixtures(division.id, body.dueBy ? new Date(body.dueBy) : undefined);
    }
  }

  return NextResponse.json({ id: division.id, name: division.name }, { status: 201 });
}
