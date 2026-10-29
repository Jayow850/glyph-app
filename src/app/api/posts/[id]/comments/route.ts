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
    // `include` on author would return every User scalar — email and
    // passwordHash among them — and this route has no auth gate. Name the
    // fields instead. CommentThread reads only the author's fullName.
    include: {
      author: { select: { id: true, profile: { select: { fullName: true, handle: true } } } },
      reactions: { select: { kind: true } },
      replies: {
        where: { deletedAt: null },
        take: 3,
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, profile: { select: { fullName: true, handle: true } } } },
        },
      },
      _count: { select: { replies: true } },
    },
  });
  return NextResponse.json(comments);
}
