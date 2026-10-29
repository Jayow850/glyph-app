import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAwardHonours } from "@/lib/services/officers";
import { createTrophy } from "@/lib/services/trophies";

const Body = z.object({
  /** "The Cookworthy Cup", not "Division 1 Winner". */
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  /** Who it honours, or who presented it. */
  namedAfter: z.string().trim().max(120).optional(),
  awardedFor: z
    .enum([
      "SEASON_CHAMPION", "DIVISION_WINNER", "LADDER_CHAMPION",
      "BEST_ATTENDANCE", "MOST_IMPROVED", "MANUAL",
    ])
    .default("MANUAL"),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireUser();
  const { slug } = await params;

  const club = await prisma.club.findUnique({ where: { slug }, select: { id: true } });
  if (!club) return NextResponse.json({ error: "no_such_club" }, { status: 404 });

  const member = await prisma.membership.findFirst({
    where: { userId, clubId: club.id, active: true },
    select: { role: true },
  });
  if (!canAwardHonours(member?.role)) {
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
    const trophy = await createTrophy(club.id, body);
    return NextResponse.json({ id: trophy.id, name: trophy.name }, { status: 201 });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "P2002") {
      return NextResponse.json({ error: "A trophy with that name already exists." }, { status: 409 });
    }
    throw e;
  }
}
