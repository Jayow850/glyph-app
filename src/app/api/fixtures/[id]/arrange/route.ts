import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { arrangeFixture } from "@/lib/services/league";

const Body = z.object({ when: z.string().datetime().nullable().optional() });

/**
 * Mark a league fixture as arranged.
 *
 * Either player may do it — in a real club whoever gets to the other
 * one first is the one who sorts the date out.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  const fixture = await prisma.leagueFixture.findUnique({
    where: { id },
    select: { whiteId: true, blackId: true, state: true },
  });
  if (!fixture) return NextResponse.json({ error: "no_such_fixture" }, { status: 404 });
  if (fixture.whiteId !== userId && fixture.blackId !== userId) {
    return NextResponse.json({ error: "not_your_fixture" }, { status: 403 });
  }
  if (fixture.state === "PLAYED" || fixture.state === "VOID") {
    return NextResponse.json({ error: "already_settled" }, { status: 409 });
  }

  const body = Body.parse(await req.json().catch(() => ({})));
  await arrangeFixture(id, body.when ? new Date(body.when) : null);
  return NextResponse.json({ ok: true });
}
