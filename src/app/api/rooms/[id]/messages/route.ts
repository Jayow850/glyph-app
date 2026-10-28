import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** Paginated message history + search (live messages flow over Socket.io). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const member = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId: id, userId } },
  });
  if (!member) return NextResponse.json({ error: "Not in this room" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q");
  const before = req.nextUrl.searchParams.get("before");
  const messages = await prisma.message.findMany({
    where: {
      roomId: id,
      deletedAt: null,
      ...(q ? { body: { contains: q, mode: "insensitive" } } : {}),
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { sender: { include: { profile: true } }, reactions: true },
  });
  await prisma.chatRoomMember.update({
    where: { roomId_userId: { roomId: id, userId } },
    data: { lastReadAt: new Date() },
  });

  return NextResponse.json(messages);
}

const Body = z.object({ body: z.string().trim().min(1).max(2000) });

/**
 * Send into an existing room.
 *
 * `dms/request` opens a thread and posts the first message; this is
 * every message after that. It re-checks the gate rather than trusting
 * that the opener did: a pending request allows exactly one message
 * until the other person accepts, and that limit has to hold here too
 * or it is not a limit at all.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  const [member, room] = await Promise.all([
    prisma.chatRoomMember.findUnique({ where: { roomId_userId: { roomId: id, userId } } }),
    prisma.chatRoom.findUnique({ where: { id } }),
  ]);
  if (!member || !room) return NextResponse.json({ error: "not_in_room" }, { status: 403 });

  if (room.isRequest && !room.acceptedAt) {
    const mine = await prisma.message.count({ where: { roomId: id, senderId: userId } });
    if (mine >= 1) {
      return NextResponse.json(
        { error: "request_pending", detail: "One message until they accept." },
        { status: 403 },
      );
    }
  }

  const { body } = Body.parse(await req.json());
  const message = await prisma.message.create({ data: { roomId: id, senderId: userId, body } });

  // Writing in a thread means you have read it.
  await prisma.chatRoomMember.update({
    where: { roomId_userId: { roomId: id, userId } },
    data: { lastReadAt: new Date() },
  });

  return NextResponse.json({ id: message.id, at: message.createdAt.getTime() }, { status: 201 });
}
