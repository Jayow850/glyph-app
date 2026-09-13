import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** The private Archive view. */
export async function GET() {
  const userId = await requireUser();
  const items = await prisma.post.findMany({
    where: { authorId: userId, archived: true },
    orderBy: { archivedAt: "desc" },
  });
  return NextResponse.json(items);
}

const Bulk = z.object({ ids: z.array(z.string()).min(1), action: z.enum(["archive", "restore", "delete"]) });

/** Bulk multi-select archive/restore/delete. */
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const { ids, action } = Bulk.parse(await req.json());
  const where = { id: { in: ids }, authorId: userId };
  if (action === "delete") { const r = await prisma.post.deleteMany({ where }); return NextResponse.json({ deleted: r.count }); }
  const r = await prisma.post.updateMany({ where, data: action === "archive" ? { archived: true, archivedAt: new Date() } : { archived: false, archivedAt: null } });
  return NextResponse.json({ updated: r.count });
}
