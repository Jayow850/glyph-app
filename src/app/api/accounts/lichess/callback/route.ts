import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { enc, fetchLichess, fetchLichessAccount, applyVerifiedRatings, RateLimited } from "@/lib/services/linkedAccounts";

/** Exchange code+verifier → token (server-side only) → fetch perfs → mark Verified. */
export async function GET(req: NextRequest) {
  const userId = await requireUser();
  const code = req.nextUrl.searchParams.get("code");
  const verifier = req.cookies.get("li_pkce")?.value;
  if (!code || !verifier) return NextResponse.redirect(new URL("/settings/accounts?error=cancelled", req.url));

  try {
    const tokenRes = await fetch("https://lichess.org/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code, code_verifier: verifier,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/accounts/lichess/callback`,
        client_id: process.env.LICHESS_CLIENT_ID ?? "glyph.gg",
      }),
    });
    if (!tokenRes.ok) return NextResponse.redirect(new URL("/settings/accounts?error=exchange", req.url));
    const { access_token } = await tokenRes.json(); // tokens can be up to 512 chars

    const account = await fetchLichessAccount(access_token);       // proves ownership
    const { ratings, title } = await fetchLichess(account.username, access_token);

    await prisma.linkedAccount.upsert({
      where: { userId_provider: { userId, provider: "LICHESS" } },
      update: { username: account.username, accessTokenEnc: enc(access_token), verified: true, ratings, title, lastSyncedAt: new Date() },
      create: { userId, provider: "LICHESS", username: account.username, accessTokenEnc: enc(access_token), verified: true, ratings, title, isPrimary: true, lastSyncedAt: new Date() },
    });
    await applyVerifiedRatings(userId, "LICHESS", ratings);

    const res = NextResponse.redirect(new URL("/settings/accounts?linked=lichess", req.url));
    res.cookies.delete("li_pkce");
    return res;
  } catch (e) {
    const q = e instanceof RateLimited ? "rate_limited" : "failed"; // 429 → UI shows "syncing…", retry after 60s
    return NextResponse.redirect(new URL(`/settings/accounts?error=${q}`, req.url));
  }
}
