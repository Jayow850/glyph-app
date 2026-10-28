import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/**
 * Your conversations, split the way the gating already splits them.
 *
 * The DM model was built properly — mutuals open a thread, strangers
 * get one message into Requests — and then nothing ever listed the
 * result, so the mail icon in the header pointed at a 404 from every
 * page in the app. This is the missing half.
 */
export async function GET() {
  const userId = await requireUser();

  const memberships = await prisma.chatRoomMember.findMany({
    where: { userId, room: { isDirect: true } },
    include: {
      room: {
        include: {
          members: { include: { user: { include: { profile: true } } } },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { sender: { select: { id: true } } },
          },
        },
      },
    },
  });

  const rooms = memberships
    .map((m) => {
      const other = m.room.members.find((x) => x.userId !== userId);
      const last = m.room.messages[0] ?? null;
      return {
        id: m.room.id,
        accepted: Boolean(m.room.acceptedAt) || !m.room.isRequest,
        name: other?.user.profile?.fullName ?? "A player",
        handle: other?.user.profile?.handle ?? "",
        country: other?.user.profile?.country ?? null,
        title: other?.user.profile?.title ?? null,
        last: last && { body: last.body, at: last.createdAt.getTime(), mine: last.senderId === userId },
        // Unread is "they wrote after I last looked" — a thread you
        // only ever wrote in is not unread.
        unread: Boolean(last && last.senderId !== userId && last.createdAt > m.lastReadAt),
        at: last?.createdAt.getTime() ?? m.room.createdAt.getTime(),
      };
    })
    // An empty request room is noise, not a conversation.
    .filter((r) => r.last !== null)
    .sort((a, b) => b.at - a.at);

  return NextResponse.json({
    inbox: rooms.filter((r) => r.accepted),
    requests: rooms.filter((r) => !r.accepted),
  });
}
