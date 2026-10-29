import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canRunCompetitions } from "@/lib/services/officers";
import { openSeason } from "@/lib/services/season";

const Body = z.object({
  /** "2026-27", as a club writes it. */
  name: z.string().trim().min(3).max(40),
  startsAt: z.string().datetime(),
  /** The split between the two halves. */
  halfwayAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

/** Open a season. A club runs one at a time. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireUser();
  const { slug } = await params;

  const club = await prisma.club.findUnique({ where: { slug }, select: { id: true } });
  if (!club) return NextResponse.json({ error: "no_such_club" }, { status: 404 });

  const member = await prisma.membership.findFirst({
    where: { userId, clubId: club.id, active: true },
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

  try {
    const season = await openSeason(club.id, {
      name: body.name,
      startsAt: new Date(body.startsAt),
      halfwayAt: new Date(body.halfwayAt),
      endsAt: new Date(body.endsAt),
    });
    return NextResponse.json({ id: season.id, name: season.name }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: message }, { status: message === "season_dates_out_of_order" ? 400 : 500 });
  }
}
