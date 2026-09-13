import { NextResponse } from "next/server";
import { standings } from "@/lib/services/tournament";
import { cached } from "@/lib/redis";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const table = await cached(`standings:${id}`, 30, () => standings(id));
  return NextResponse.json(table);
}
