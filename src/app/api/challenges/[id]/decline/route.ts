import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** Decline a challenge, or withdraw one you sent. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;

  const challenge = await prisma.challenge.findUniqueOrThrow({ where: { id } });
  if (challenge.toId !== userId && challenge.fromId !== userId) {
    return NextResponse.json({ error: "not_yours" }, { status: 403 });
  }
  if (challenge.status !== "pending") {
    return NextResponse.json({ error: "already_handled" }, { status: 409 });
  }

  await prisma.challenge.update({
    where: { id },
    data: { status: challenge.fromId === userId ? "withdrawn" : "declined" },
  });

  return NextResponse.json({ ok: true });
}
