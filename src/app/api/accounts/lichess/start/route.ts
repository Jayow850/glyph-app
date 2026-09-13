import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireUser } from "@/lib/auth";

/**
 * Lichess OAuth2 + PKCE — no client secret needed, safe for mobile/SPA.
 * We generate verifier+challenge server-side, park the verifier in an
 * httpOnly cookie, and hand the client the authorize URL.
 */
export async function POST() {
  await requireUser();
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LICHESS_CLIENT_ID ?? "glyph.gg",
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/accounts/lichess/callback`,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: "", // ratings are public; the token exists purely to prove ownership
  });
  const res = NextResponse.json({ authorizeUrl: `https://lichess.org/oauth?${params}` });
  res.cookies.set("li_pkce", verifier, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
