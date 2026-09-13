import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/**
 * DM gating — IG/TikTok/X model:
 * mutuals → open thread instantly; non-mutuals → ONE message into Requests,
 * no more until the recipient accepts.
 */
const Body = z.object({ toHandle: z.string(), body: z.string().min(1).max(2000) });

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const { toHandle, body } = Body.parse(await req.json());
  const target = await prisma.profile.findUniqueOrThrow({ where: { handle: toHandle } });

  const [iFollow, followsMe] = await Promise.all([
    prisma.follow.findUnique({ where: { followerId_followingId: { followerId: userId, followingId: target.userId } } }),
    prisma.follow.findUnique({ where: { followerId_followingId: { followerId: target.userId, followingId: userId } } }),
  ]);
  const mutual = !!iFollow && !!followsMe;

  let room = await prisma.chatRoom.findFirst({
    where: { isDirect: true, members: { every: { userId: { in: [userId, target.userId] } } }, AND: [{ members: { some: { userId } } }, { members: { some: { userId: target.userId } } }] },
  });

  if (!room) {
    room = await prisma.chatRoom.create({
      data: {
        isDirect: true,
        isRequest: !mutual,
        acceptedAt: mutual ? new Date() : null,
        members: { create: [{ userId }, { userId: target.userId }] },
      },
    });
  } else if (room.isRequest && !room.acceptedAt) {
    const priorFromMe = await prisma.message.count({ where: { roomId: room.id, senderId: userId } });
    if (priorFromMe >= 1) return NextResponse.json({ error: "Request pending — one message until they accept" }, { status: 403 });
  }

  const msg = await prisma.message.create({ data: { roomId: room.id, senderId: userId, body } });
  return NextResponse.json({ room, message: msg, landedInRequests: room.isRequest && !room.acceptedAt }, { status: 201 });
}
