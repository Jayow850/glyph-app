import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireRole, can } from "@/lib/rbac";
import { notify } from "@/lib/services/notifications";

/** POST: request to join a private club. Public clubs use /join directly. */
export async function POST(_: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireUser();
  const { slug } = await params;
  const club = await prisma.club.findUniqueOrThrow({ where: { slug } });
  if (club.isPublic) return NextResponse.json({ error: "Public club — use /join" }, { status: 400 });
  const req = await prisma.clubJoinRequest.upsert({
    where: { clubId_userId: { clubId: club.id, userId } },
    create: { clubId: club.id, userId },
    update: { status: "PENDING" },
  });
  const admins = await prisma.membership.findMany({ where: { clubId: club.id, role: { in: ["OWNER", "ADMIN"] } } });
  await notify({ userIds: admins.map((a) => a.userId), type: "CLUB_ANNOUNCEMENT", title: "New join request", linkUrl: `/club/${slug}/admin` });
  return NextResponse.json(req, { status: 201 });
}

/** GET: admin views the pending queue. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireUser();
  const { slug } = await params;
  const club = await prisma.club.findUniqueOrThrow({ where: { slug } });
  await requireRole(userId, club.id, can.manageClub);
  const queue = await prisma.clubJoinRequest.findMany({
    where: { clubId: club.id, status: "PENDING" },
    // An organiser reviewing applicants needs their name, not their
    // password hash. `include` on a user relation returns both.
    include: {
      user: {
        select: {
          id: true,
          profile: { select: { fullName: true, handle: true, country: true, title: true } },
        },
      },
    },
  });
  return NextResponse.json(queue);
}

const Decide = z.object({ requestId: z.string(), approve: z.boolean() });

/** PATCH: admin approves/denies. Approval creates the membership. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const userId = await requireUser();
  const { slug } = await params;
  const { requestId, approve } = Decide.parse(await req.json());
  const club = await prisma.club.findUniqueOrThrow({ where: { slug } });
  await requireRole(userId, club.id, can.manageClub);

  const jr = await prisma.clubJoinRequest.update({
    where: { id: requestId },
    data: { status: approve ? "APPROVED" : "DENIED", decidedBy: userId },
  });
  if (approve) {
    await prisma.membership.upsert({
      where: { userId_clubId: { userId: jr.userId, clubId: club.id } },
      create: { userId: jr.userId, clubId: club.id, role: "PLAYER" },
      update: { active: true },
    });
  }
  await notify({ userIds: [jr.userId], type: "CLUB_ANNOUNCEMENT", title: approve ? `Welcome to ${club.name} ♟` : `${club.name} declined your request` });
  return NextResponse.json(jr);
}
