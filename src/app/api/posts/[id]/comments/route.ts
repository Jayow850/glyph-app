import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { comment } from "@/lib/services/social";

const Body = z.object({
  body: z.string().max(2000).optional(),
  videoUrl: z.string().url().optional(),   // 15s video reply
  parentId: z.string().optional(),          // threaded reply
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const b = Body.parse(await req.json());
  const c = await comment(userId, id, b.body, b.videoUrl, b.parentId);
  return NextResponse.json(c, { status: 201 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cursor = req.nextUrl.searchParams.get("cursor");
  const comments = await prisma.comment.findMany({
    where: { postId: id, parentId: null, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 30,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      author: { include: { profile: true } },
      reactions: { select: { kind: true } },
      replies: {
        where: { deletedAt: null },
        take: 3,
        orderBy: { createdAt: "asc" },
        include: { author: { include: { profile: true } } },
      },
      _count: { select: { replies: true } },
    },
  });
  return NextResponse.json(comments);
}
