import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** Recipient accepts a message request → full thread opens. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const member = await prisma.chatRoomMember.findUnique({ where: { roomId_userId: { roomId: id, userId } } });
  if (!member) return NextResponse.json({ error: "Not your inbox" }, { status: 403 });
  const room = await prisma.chatRoom.update({ where: { id }, data: { isRequest: false, acceptedAt: new Date() } });
  return NextResponse.json(room);
}
