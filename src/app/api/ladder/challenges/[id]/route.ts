import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canRunCompetitions } from "@/lib/services/officers";
import { respond, recordResult } from "@/lib/services/ladder";

// Discriminated, not a plain union: TypeScript narrows a plain union
// of object types unreliably when one member's discriminant is itself
// a union, and the result branch below needs the narrowing to hold.
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }),
  z.object({ action: z.literal("decline") }),
  z.object({
    action: z.literal("result"),
    /** Null for a draw: the defender holds the rung. */
    winnerId: z.string().min(1).nullable(),
    liveGameId: z.string().min(1).optional(),
  }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (body.action === "accept" || body.action === "decline") {
    const r = await respond(id, userId, body.action === "accept");
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  // Reporting a result moves rungs, so it is an officer's call unless
  // the reporter played in the game themselves.
  const c = await prisma.ladderChallenge.findUnique({
    where: { id },
    select: { clubId: true, challengerId: true, defenderId: true },
  });
  if (!c) return NextResponse.json({ error: "no_such_challenge" }, { status: 404 });

  const played = c.challengerId === userId || c.defenderId === userId;
  if (!played) {
    const member = await prisma.membership.findFirst({
      where: { userId, clubId: c.clubId, active: true },
      select: { role: true },
    });
    if (!canRunCompetitions(member?.role)) {
      return NextResponse.json({ error: "officers_only" }, { status: 403 });
    }
  }

  if (body.winnerId && body.winnerId !== c.challengerId && body.winnerId !== c.defenderId) {
    return NextResponse.json({ error: "winner_not_in_this_game" }, { status: 400 });
  }

  const r = await recordResult(id, body.winnerId, body.liveGameId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ ok: true, moved: r.moved });
}
