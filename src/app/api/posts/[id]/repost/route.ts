import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { invalidate } from "@/lib/redis";

/** Repost — TikTok/X-style. Shows "You reposted" on your profile and in followers' feeds. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const original = await prisma.post.findUniqueOrThrow({ where: { id } });
  const dup = await prisma.post.findFirst({ where: { authorId: userId, repostOfId: id } });
  if (dup) {
    await prisma.post.delete({ where: { id: dup.id } });
    await prisma.post.update({ where: { id }, data: { repostCount: { decrement: 1 } } });
    await invalidate("feed:");
    return NextResponse.json({ reposted: false });
  }
  await prisma.post.create({ data: { authorId: userId, type: original.type, repostOfId: id } });
  await prisma.post.update({ where: { id }, data: { repostCount: { increment: 1 } } });
  await invalidate("feed:");
  return NextResponse.json({ reposted: true });
}
