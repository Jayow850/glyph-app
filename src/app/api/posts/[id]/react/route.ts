import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { react } from "@/lib/services/social";

const Body = z.object({ kind: z.enum(["PAWN", "BRILLIANT", "FIRE", "SHOCK"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const { kind } = Body.parse(await req.json());
  return NextResponse.json(await react(userId, kind, { postId: id }));
}
