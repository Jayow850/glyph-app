import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { assertWithinLimits } from "@/lib/limits";
import { notify } from "@/lib/services/notifications";

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

  const admins = await prisma.membership.findMany({
    where: { clubId: club.id, role: { in: ["OWNER", "ADMIN"] } },
  });
  await notify({
    userIds: admins.map((a) => a.userId),
    type: "CLUB_ANNOUNCEMENT",
    title: "New member joined your club",
    linkUrl: `/club/${slug}/members`,
  });

  return NextResponse.json(membership, { status: 201 });
}
