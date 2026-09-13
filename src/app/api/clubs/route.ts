import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const CreateClub = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  description: z.string().max(2000).optional(),
  country: z.string().length(2).optional(),
  city: z.string().max(80).optional(),
  isScholastic: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const body = CreateClub.parse(await req.json());

  const club = await prisma.club.create({
    data: {
      ...body,
      inviteCode: crypto.randomUUID().slice(0, 8),
      memberships: { create: { userId, role: "OWNER" } },
      subscription: { create: { tier: "FREE" } },
      chatRooms: {
        create: [
          { name: "announcements", isAnnouncement: true, category: "Info", position: 0 },
          { name: "general", category: "Community", position: 1 },
          { name: "game-analysis", category: "Community", position: 2 },
          { name: "tournaments", category: "Play", position: 3 },
          { name: "off-topic", category: "Community", position: 4 },
        ],
      },
    },
  });
  return NextResponse.json(club, { status: 201 });
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const clubs = await prisma.club.findMany({
    where: { isPublic: true, name: { contains: q, mode: "insensitive" } },
    take: 25,
    include: { _count: { select: { memberships: true } } },
  });
  return NextResponse.json(clubs);
}
