import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dec, fetchLichess, fetchChessComStats, applyVerifiedRatings, RateLimited } from "@/lib/services/linkedAccounts";


export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const stale = await prisma.linkedAccount.findMany({
    where: { verified: true, OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(Date.now() - 6 * 3600_000) } }] },
    take: 200, orderBy: { lastSyncedAt: "asc" },
  });

  let refreshed = 0, rateLimited = 0, failed = 0;
  for (const link of stale) { // serial on purpose — polite to both APIs
    try {
      const ratings = link.provider === "LICHESS"
        ? (await fetchLichess(link.username, link.accessTokenEnc ? dec(link.accessTokenEnc) : undefined)).ratings
        : await fetchChessComStats(link.username);
      await prisma.linkedAccount.update({ where: { id: link.id }, data: { ratings, lastSyncedAt: new Date() } });
      if (link.isPrimary) await applyVerifiedRatings(link.userId, link.provider, ratings as Record<string, number | null>);
      refreshed++;
    } catch (e) {
      if (e instanceof RateLimited) { rateLimited++; await new Promise((r) => setTimeout(r, e.retryAfterMs)); }
      else failed++; // username changed / account closed → UI prompts re-link on next open
    }
  }
  return NextResponse.json({ refreshed, rateLimited, failed, scanned: stale.length });
}
