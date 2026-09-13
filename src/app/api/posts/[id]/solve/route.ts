import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { solvePuzzle } from "@/lib/services/social";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const { answer } = z.object({ answer: z.string().max(12) }).parse(await req.json());
  return NextResponse.json(await solvePuzzle(userId, id, answer));
}
