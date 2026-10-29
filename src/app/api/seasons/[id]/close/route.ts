import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canAwardHonours } from "@/lib/services/officers";
import { closeSeason, openChampionship, previewHonours } from "@/lib/services/season";
import { applyPromotionRelegation, computeMovement } from "@/lib/services/league";

/**
 * The closing ceremony, and the half that precedes it.
 *
 * `?half=AUTUMN|SPRING` settles that half: final ranks, promotion and
 * relegation, and the post announcing who moved. With no half, it
 * closes the season: championship resolved, honours written into club
 * history permanently.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  const season = await prisma.season.findUnique({ where: { id }, select: { clubId: true } });
  if (!season) return NextResponse.json({ error: "no_such_season" }, { status: 404 });

  const member = await prisma.membership.findFirst({
    where: { userId, clubId: season.clubId, active: true },
    select: { role: true },
  });
  if (!canAwardHonours(member?.role)) {
    return NextResponse.json({ error: "officers_only" }, { status: 403 });
  }

  const params2 = new URL(req.url).searchParams;
  const half = params2.get("half");
  // Nothing is written on a preview. Relegation is a conversation at
  // the club, not an accidental tap.
  const preview = params2.get("preview") === "1";

  if (half === "AUTUMN" || half === "SPRING") {
    if (preview) {
      return NextResponse.json({ movement: await computeMovement(id, half) });
    }
    const result = await applyPromotionRelegation(id, half);
    return NextResponse.json(result ?? { moves: [] });
  }

  if (preview) {
    return NextResponse.json({ honours: await previewHonours(id) });
  }

  await openChampionship(id);
  const closed = await closeSeason(id);
  return NextResponse.json(closed ?? { error: "already_closed" }, { status: closed ? 200 : 409 });
}
