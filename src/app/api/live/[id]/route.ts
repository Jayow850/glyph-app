import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** Stream detail + Top Supporters leaderboard. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [stream, supporters] = await Promise.all([
    prisma.liveStream.findUniqueOrThrow({ where: { id }, include: { host: { include: { profile: true } } } }),
    prisma.giftSend.groupBy({ by: ["senderId"], where: { streamId: id }, _sum: { coins: true }, orderBy: { _sum: { coins: "desc" } }, take: 5 }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: supporters.map((s) => s.senderId) } }, include: { profile: true } });
  return NextResponse.json({
    stream,
    topSupporters: supporters.map((s) => ({ user: users.find((u) => u.id === s.senderId), coins: s._sum.coins })),
  });
}

/** Host moderation: end stream, toggle gifts. Host-only, server-enforced. */
const Patch = z.object({ action: z.enum(["end", "gifts_on", "gifts_off"]) });
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const stream = await prisma.liveStream.findUniqueOrThrow({ where: { id } });
  if (stream.hostId !== userId) return NextResponse.json({ error: "host_only" }, { status: 403 });
  const { action } = Patch.parse(await req.json());
  const updated = await prisma.liveStream.update({
    where: { id },
    data: action === "end" ? { status: "ENDED", endedAt: new Date() } : { giftsDisabled: action === "gifts_off" },
  });
  return NextResponse.json(updated);
}
