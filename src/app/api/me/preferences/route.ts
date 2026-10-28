import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const Body = z.object({
  /** Hide the rail's reactions while you are playing. */
  railMuted: z.boolean().optional(),
  boardTheme: z.string().max(40).optional(),
  pieceSet: z.string().max(40).optional(),
});

/** Settings that belong to the person rather than to one device. */
export async function PATCH(req: NextRequest) {
  const userId = await requireUser();
  const body = Body.parse(await req.json());

  const profile = await prisma.profile.update({
    where: { userId },
    data: body,
    select: { railMuted: true, boardTheme: true, pieceSet: true },
  });

  return NextResponse.json(profile);
}

export async function GET() {
  const userId = await requireUser();
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { railMuted: true, boardTheme: true, pieceSet: true },
  });
  return NextResponse.json(profile ?? { railMuted: false });
}
