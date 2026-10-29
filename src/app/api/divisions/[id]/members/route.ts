import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAllocateDivisions } from "@/lib/services/officers";
import { allocate, generateFixtures } from "@/lib/services/league";

const Body = z.object({
  userId: z.string().min(1),
  /** Rebuild fixtures after adding. Only safe before the half starts. */
  regenerate: z.boolean().default(false),
});

/** Allocate a member to a division, at the secretary's discretion. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser();
  const { id } = await params;

  const division = await prisma.division.findUnique({
    where: { id },
    select: { id: true, season: { select: { clubId: true } } },
  });
  if (!division) return NextResponse.json({ error: "no_such_division" }, { status: 404 });

  const member = await prisma.membership.findFirst({
    where: { userId: actor, clubId: division.season.clubId, active: true },
    select: { role: true },
  });
  if (!canAllocateDivisions(member?.role)) {
    return NextResponse.json({ error: "officers_only" }, { status: 403 });
  }

  const body = Body.parse(await req.json());

  const inClub = await prisma.membership.findFirst({
    where: { userId: body.userId, clubId: division.season.clubId, active: true },
    select: { id: true },
  });
  if (!inClub) return NextResponse.json({ error: "not_a_member" }, { status: 400 });

  await allocate(id, body.userId);

  if (body.regenerate) {
    const played = await prisma.leagueFixture.count({ where: { divisionId: id, result: { not: null } } });
    if (played > 0) {
      return NextResponse.json(
        { ok: true, warning: "games_already_played_fixtures_not_regenerated" },
        { status: 200 },
      );
    }
    await prisma.leagueFixture.deleteMany({ where: { divisionId: id } });
    await generateFixtures(id);
  }

  return NextResponse.json({ ok: true });
}
