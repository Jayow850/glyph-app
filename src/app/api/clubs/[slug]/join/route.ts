import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { assertWithinLimits } from "@/lib/limits";
import { onJoinClub } from "@/lib/services/onboarding";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireUser();
  const { slug } = await params;
  const invite = req.nextUrl.searchParams.get("invite");

  const club = await prisma.club.findUniqueOrThrow({ where: { slug } });
  if (!club.isPublic && club.inviteCode !== invite)
    return NextResponse.json({ error: "Invite required" }, { status: 403 });

  await assertWithinLimits(club.id, "member");

  // Scholastic safety: minors need a linked parent account before joining
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (club.isScholastic && user.isMinor && !user.parentId)
    return NextResponse.json({ error: "A parent account must be linked first" }, { status: 403 });

  const membership = await prisma.membership.upsert({
    where: { userId_clubId: { userId, clubId: club.id } },
    create: { userId, clubId: club.id, role: "PLAYER" },
    update: { active: true },
  });

  // The club notices. Welcome post, a host for the first week, and
  // the organisers told — see services/onboarding.ts. It never throws,
  // so a failure there cannot cost someone their membership.
  await onJoinClub(club.id, userId);

  return NextResponse.json(membership, { status: 201 });
}
