import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { friendsOf } from "@/lib/services/social";

export async function GET() {
  const userId = await requireUser();
  return NextResponse.json(await friendsOf(userId));
}
