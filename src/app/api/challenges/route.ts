import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** "Challenge someone to Rapid 15+10 inside a thread" — the card starts here. */
const Body = z.object({
  toHandle: z.string(),
  timeControl: z.string().regex(/^\d{1,5}\+\d{1,3}$/).default("900+10"),
  color: z.enum(["white", "black", "random"]).default("random"),
  rated: z.boolean().default(true),
  threadId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const b = Body.parse(await req.json());
  const to = await prisma.profile.findUniqueOrThrow({ where: { handle: b.toHandle.replace(/^@/, "") } });
  if (to.userId === userId) return NextResponse.json({ error: "self_challenge" }, { status: 400 });
  const c = await prisma.challenge.create({ data: { fromId: userId, toId: to.userId, timeControl: b.timeControl, color: b.color, rated: b.rated } });
  return NextResponse.json(c, { status: 201 });
}

export async function GET() {
  const userId = await requireUser();
  const pending = await prisma.challenge.findMany({
    where: { toId: userId, status: "pending" },
    include: { from: { include: { profile: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(pending);
}
