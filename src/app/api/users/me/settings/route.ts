import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const Body = z.object({
  boardTheme: z.enum(["midnight", "tournament", "walnut", "ice"]).optional(),
  pieceSet: z.enum(["classic", "alpha", "staunton"]).optional(),
});

/** Board customization — pick your board like chess.com / lichess. */
export async function PATCH(req: NextRequest) {
  const userId = await requireUser();
  const body = Body.parse(await req.json());
  const profile = await prisma.profile.update({ where: { userId }, data: body });
  return NextResponse.json({ boardTheme: profile.boardTheme, pieceSet: profile.pieceSet });
}
