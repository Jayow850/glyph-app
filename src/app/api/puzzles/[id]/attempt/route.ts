import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { Engine, parseSquare } from "../../../../../../lib/game/engine.ts";

/**
 * Rated puzzle solves are SERVER-confirmed: we load the puzzle FEN into the
 * real engine, apply the attempt, and compare SAN against the stored solution
 * line. Client-side validation is prediction only.
 */
const Body = z.object({ from: z.string(), to: z.string(), promotion: z.string().optional(), ms: z.number().int().positive() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const { from, to, promotion, ms } = Body.parse(await req.json());
  const post = await prisma.post.findUniqueOrThrow({ where: { id } });
  const payload = post.payload as { fen?: string; solution?: string[] };
  if (post.type !== "PUZZLE" || !payload?.fen || !payload?.solution?.length) {
    return NextResponse.json({ error: "not_a_puzzle" }, { status: 400 });
  }

  const eng = new Engine(payload.fen);
  const move = eng.move(parseSquare(from), parseSquare(to), promotion);
  const correct = !!move && move.san === payload.solution[0];

  // one rated attempt per user per puzzle — replays don't inflate stats
  await prisma.puzzleAttempt.upsert({
    where: { postId_userId: { postId: id, userId } },
    update: {},
    create: { postId: id, userId, correct, ms },
  });
  const [solved, total, fastest] = await Promise.all([
    prisma.puzzleAttempt.count({ where: { postId: id, correct: true } }),
    prisma.puzzleAttempt.count({ where: { postId: id } }),
    prisma.puzzleAttempt.findFirst({ where: { postId: id, correct: true }, orderBy: { ms: "asc" }, include: { user: { include: { profile: true } } } }),
  ]);
  return NextResponse.json({
    correct, san: move?.san ?? null,
    reply: correct && payload.solution[1] ? payload.solution[1] : null, // opponent auto-reply for multi-move lines
    stats: { solved, total, rate: total ? Math.round((solved / total) * 100) : 0, fastestMs: fastest?.ms ?? null, fastestBy: fastest?.user?.profile?.handle ?? null },
  });
}
