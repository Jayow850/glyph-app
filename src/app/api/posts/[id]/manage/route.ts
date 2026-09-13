import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { invalidate } from "@/lib/redis";

const Action = z.object({
  action: z.enum(["archive", "restore", "pin", "unpin", "edit", "visibility"]),
  body: z.string().optional(),
  visibility: z.enum(["PUBLIC", "FOLLOWERS", "ONLY_ME"]).optional(),
});

/** Owner-only content management. Archive keeps stats; restore brings them back intact. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const post = await prisma.post.findUniqueOrThrow({ where: { id } });
  if (post.authorId !== userId) return NextResponse.json({ error: "Not your post" }, { status: 403 });

  const { action, body, visibility } = Action.parse(await req.json());
  const data: Record<string, unknown> =
    action === "archive"   ? { archived: true, archivedAt: new Date(), pinned: false, pinnedAt: null }
  : action === "restore"   ? { archived: false, archivedAt: null }
  : action === "pin"       ? { pinned: true, pinnedAt: new Date() }
  : action === "unpin"     ? { pinned: false, pinnedAt: null }
  : action === "edit"      ? { body, editedAt: new Date() }
  : /* visibility */         { visibility };

  const updated = await prisma.post.update({ where: { id }, data });
  await invalidate("feed:");
  return NextResponse.json(updated);
}

/** Permanent delete — cascades metrics via schema onDelete. */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const post = await prisma.post.findUniqueOrThrow({ where: { id } });
  if (post.authorId !== userId) return NextResponse.json({ error: "Not your post" }, { status: 403 });
  await prisma.post.delete({ where: { id } });
  await invalidate("feed:");
  return NextResponse.json({ deleted: true });
}
