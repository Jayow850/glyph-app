import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { bookmark } from "@/lib/services/social";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  const { folder } = z.object({ folder: z.string().max(60).optional() }).parse(await req.json().catch(() => ({})));
  return NextResponse.json(await bookmark(userId, id, folder));
}
