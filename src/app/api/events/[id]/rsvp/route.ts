import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const Body = z.object({ status: z.enum(["GOING", "MAYBE", "NOT_GOING"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const { status } = Body.parse(await req.json());

  const event = await prisma.event.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { rsvps: { where: { status: "GOING" } } } } },
  });

  // Capacity → waitlist
  const finalStatus =
    status === "GOING" && event.capacity && event._count.rsvps >= event.capacity
      ? "WAITLIST"
      : status;

  const rsvp = await prisma.rsvp.upsert({
    where: { eventId_userId: { eventId: id, userId } },
    create: { eventId: id, userId, status: finalStatus },
    update: { status: finalStatus },
  });
  return NextResponse.json(rsvp);
}
