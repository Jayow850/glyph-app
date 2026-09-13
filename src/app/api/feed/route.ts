import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { forYou, following, clubsFeed, liveNow, rising, clips } from "@/lib/services/feed";

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") ?? "foryou";
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  switch (tab) {
    case "foryou":    return NextResponse.json(await forYou());
    case "following": return NextResponse.json(await following(await requireUser(), cursor));
    case "clubs":     return NextResponse.json(await clubsFeed(await requireUser()));
    case "live":      return NextResponse.json(await liveNow());
    case "rising":    return NextResponse.json(await rising());
    case "clips":     return NextResponse.json(await clips(cursor));
    default:          return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
  }
}
