import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { follow } from "@/lib/services/social";

export async function POST(_: Request, { params }: { params: Promise<{ handle: string }> }) {
  const userId = await requireUser();
  const { handle } = await params;
  return NextResponse.json(await follow(userId, handle));
}
