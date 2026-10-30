import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { canRunCompetitions } from "@/lib/services/officers";
import { challenge, join } from "@/lib/services/ladder";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("join") }),
  z.object({ action: z.literal("challenge"), defenderId: z.string().min(1) }),
]);

const Rules = z.object({
  ladderRange: z.number().int().min(1).max(20),
  ladderCooldownDays: z.number().int().min(0).max(365),
  ladderMaxPerWeek: z.number().int().min(1).max(20),
  ladderMaxDeclines: z.number().int().min(1).max(10),
});

async function clubAndMember(slug: string, userId: string) {
  const club = await prisma.club.findUnique({ where: { slug }, select: { id: true } });
  if (!club) return null;
  const member = await prisma.membership.findFirst({
    where: { userId, clubId: club.id, active: true },
    select: { role: true },
  });
  return { club, member };
}

/** Join the ladder, or challenge somebody on it. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireUser();
  const { slug } = await params;

  const found = await clubAndMember(slug, userId);
  if (!found) return NextResponse.json({ error: "no_such_club" }, { status: 404 });
  if (!found.member) return NextResponse.json({ error: "members_only" }, { status: 403 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  if (body.action === "join") {
    const position = await join(found.club.id, userId);
    return NextResponse.json({ position }, { status: 201 });
  }

  const result = await challenge(found.club.id, userId, body.defenderId);
  // 409, not 400: the request was well-formed, a ladder rule refused it.
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(
    { id: result.id, autoAccepted: result.autoAccepted },
    { status: 201 },
  );
}

/** Tune the four rules. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireUser();
  const { slug } = await params;

  const found = await clubAndMember(slug, userId);
  if (!found) return NextResponse.json({ error: "no_such_club" }, { status: 404 });
  if (!canRunCompetitions(found.member?.role)) {
    return NextResponse.json({ error: "officers_only" }, { status: 403 });
  }

  let rules: z.infer<typeof Rules>;
  try {
    rules = Rules.parse(await req.json());
  } catch (e) {
    const issue = e instanceof z.ZodError ? e.issues[0] : null;
    return NextResponse.json(
      { error: issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid" },
      { status: 400 },
    );
  }

  await prisma.club.update({ where: { id: found.club.id }, data: rules });
  return NextResponse.json({ ok: true });
}
