import { NextRequest, NextResponse } from "next/server";
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
  return NextResponse.json(messages);
}
