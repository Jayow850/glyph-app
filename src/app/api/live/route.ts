import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hotStreams } from "@/lib/services/popularity";

/** Go live (video or audio-only commentary). */
const Body = z.object({ title: z.string().min(1).max(120), audioOnly: z.boolean().default(false) });
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const { title, audioOnly } = Body.parse(await req.json());
  const stream = await prisma.liveStream.create({ data: { hostId: userId, title, audioOnly } });
  return NextResponse.json(stream, { status: 201 });
}

/** The Live tab: streams ranked by popularity (viewers + likes + gifts + watch-time). */
export async function GET() {
  const hot = await hotStreams(20);
  const rows = await prisma.liveStream.findMany({
    where: { id: { in: hot.map((h) => h.id) }, status: "LIVE" },
    include: { host: { include: { profile: true } } },
  });
  const ranked = hot.map((h) => ({ ...rows.find((r) => r.id === h.id), popularity: Math.round(h.score) })).filter((r) => r.id);
  return NextResponse.json(ranked);
}
