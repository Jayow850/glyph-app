import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAwardHonours } from "@/lib/services/officers";
import { awardTrophy } from "@/lib/services/trophies";

const Body = z.object({
  /** As engraved: "1987-88", "1974". */
  year: z.string().trim().min(2).max(20),
  /** A GLYPH account, when the winner has one. */
  userId: z.string().trim().min(1).optional(),
  /** The engraved name, when they never will. */
  winnerName: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(200).optional(),
  /** Backfill stays quiet; nobody wants fifty notifications about 1974. */
  announce: z.boolean().default(false),
});

/**
 * Put a name on a trophy — this year's winner, or 1974's.
 *
 * The same route does both. A club typing in half a century of history
 * should not meet a different, lesser form than the one used today.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser();
  const { id } = await params;

  const trophy = await prisma.trophy.findUnique({
    where: { id },
    select: { id: true, clubId: true },
  });
  if (!trophy) return NextResponse.json({ error: "no_such_trophy" }, { status: 404 });

  const member = await prisma.membership.findFirst({
    where: { userId: actor, clubId: trophy.clubId, active: true },
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
    const award = await awardTrophy(id, body);
    return NextResponse.json({ id: award.id, year: award.year }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "failed";
    return NextResponse.json(
      { error: message === "winner_required" ? "Give a winner — an account or a name." : message },
      { status: message === "winner_required" ? 400 : 500 },
    );
  }
}

/** Correct a mistyped year or a misspelled name. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireUser();
  const { id } = await params;
  const awardId = new URL(req.url).searchParams.get("award");
  if (!awardId) return NextResponse.json({ error: "award_required" }, { status: 400 });

  const trophy = await prisma.trophy.findUnique({
    where: { id },
    select: { clubId: true },
  });
  if (!trophy) return NextResponse.json({ error: "no_such_trophy" }, { status: 404 });

  const member = await prisma.membership.findFirst({
    where: { userId: actor, clubId: trophy.clubId, active: true },
    select: { role: true },
  });
  if (!canAwardHonours(member?.role)) {
    return NextResponse.json({ error: "officers_only" }, { status: 403 });
  }

  await prisma.trophyAward.deleteMany({ where: { id: awardId, trophyId: id } });
  return NextResponse.json({ ok: true });
}
