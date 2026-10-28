import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/services/notifications";

/**
 * Greet a newcomer.
 *
 * A welcome is a reaction, not a new concept: same table, same
 * uniqueness constraint, so it cannot be double-counted, and the
 * count of them is the recognition the newcomer sees.
 *
 * The first one to land stamps Membership.welcomedAt, which is what
 * the organizer view reads to tell "greeted" from "arrived and
 * ignored" — and the second is the state a club loses people from.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, clubId: true, subjectUserId: true, type: true },
  });
  if (!post || post.type !== "WELCOME" || !post.subjectUserId) {
    return NextResponse.json({ error: "not_a_welcome" }, { status: 400 });
  }
  if (post.subjectUserId === userId) {
    return NextResponse.json({ error: "cannot_welcome_yourself" }, { status: 400 });
  }

  await prisma.reaction.upsert({
    where: {
      userId_kind_postId_commentId_messageId: {
        userId, kind: "WELCOME", postId: id, commentId: null as never, messageId: null as never,
      },
    },
    create: { userId, kind: "WELCOME", postId: id },
    update: {},
  });

  // Only the first welcome stamps the membership and notifies — the
  // tenth is lovely, but the newcomer does not need ten pings.
  if (post.clubId) {
    const stamped = await prisma.membership.updateMany({
      where: { clubId: post.clubId, userId: post.subjectUserId, welcomedAt: null },
      data: { welcomedAt: new Date() },
    });
    if (stamped.count > 0) {
      const greeter = await prisma.profile.findUnique({
        where: { userId },
        select: { fullName: true },
      });
      await notify({
        userIds: [post.subjectUserId],
        type: "CLUB_ANNOUNCEMENT",
        title: `${greeter?.fullName ?? "Someone"} welcomed you`,
        linkUrl: `/club`,
      });
    }
  }

  const count = await prisma.reaction.count({ where: { postId: id, kind: "WELCOME" } });
  return NextResponse.json({ ok: true, welcomes: count });
}
