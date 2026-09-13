import { NextResponse } from "next/server";
import { sharePost } from "@/lib/services/social";

// Guests can share — no auth gate, like every big app.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await sharePost(id));
}
