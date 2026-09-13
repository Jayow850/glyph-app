import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { fetchChessComProfile, fetchChessComStats, applyVerifiedRatings } from "@/lib/services/linkedAccounts";

/**
 * Chess.com has no OAuth — ownership is proven with a bio-code handshake:
 * we issue GLYPH-XXXXX, the user drops it in their profile Location (or Name),
 * we read it back via the public PubAPI. Match → Verified.
 */
const Start = z.object({ username: z.string().min(2).max(50) });

/** Step 1: issue the code. Also validates the account exists (and isn't closed). */
export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const { username } = Start.parse(await req.json());
  const profile = await fetchChessComProfile(username);
  if (!profile) return NextResponse.json({ error: "not_found", message: "No Chess.com account with that username." }, { status: 404 });

  const code = `GLYPH-${crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 5)}`;
  await prisma.linkedAccount.upsert({
    where: { userId_provider: { userId, provider: "CHESSCOM" } },
    update: { username, verifyCode: code, verified: false },
    create: { userId, provider: "CHESSCOM", username, verifyCode: code, verified: false },
  });
  return NextResponse.json({
    code,
    instructions: "Add this code to your Chess.com profile Location (or Name) field, then tap Verify. You can remove it right after.",
    note: "Chess.com caches profile data ~12–24h — if Verify can't see it yet, wait a few minutes and check again.",
  });
}

/**
 * Step 2: verify. Checks location OR name for the code (name = fallback path
 * for users who can't edit Location). Match → Verified + ratings imported.
 * unverifiedOk=true lets a user store a self-entered username with NO gold ✓.
 */
const Verify = z.object({ unverifiedOk: z.boolean().optional() });
export async function PUT(req: NextRequest) {
  const userId = await requireUser();
  const { unverifiedOk } = Verify.parse(await req.json().catch(() => ({})));
  const link = await prisma.linkedAccount.findUnique({ where: { userId_provider: { userId, provider: "CHESSCOM" } } });
  if (!link) return NextResponse.json({ error: "no_pending_link" }, { status: 400 });

  const profile = await fetchChessComProfile(link.username);
  if (!profile) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const hay = `${profile.location ?? ""} ${profile.name ?? ""}`;
  const matched = !!link.verifyCode && hay.includes(link.verifyCode);

  if (!matched && !unverifiedOk) {
    return NextResponse.json({
      verified: false,
      message: "We couldn't find the code yet — Chess.com can take a few minutes to update; try again.",
    }, { status: 409 });
  }

  const ratings = await fetchChessComStats(link.username);
  await prisma.linkedAccount.update({
    where: { userId_provider: { userId, provider: "CHESSCOM" } },
    data: { verified: matched, verifyCode: null, ratings, lastSyncedAt: new Date() },
  });
  if (matched) await applyVerifiedRatings(userId, "CHESSCOM", ratings);

  return NextResponse.json({
    verified: matched, ratings,
    message: matched ? "Verified — you can remove the code from your profile now. ✓" : "Saved as unverified (no gold check).",
  });
}
