import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** List linked accounts (tokens never leave the server). */
export async function GET() {
  const userId = await requireUser();
  const accounts = await prisma.linkedAccount.findMany({
    where: { userId },
    select: { provider: true, username: true, verified: true, ratings: true, title: true, isPrimary: true, lastSyncedAt: true },
  });
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { primaryRatingKey: true } });
  return NextResponse.json({ accounts, primaryRatingKey: profile?.primaryRatingKey ?? "rapid" });
}

const Patch = z.object({
  primaryProvider: z.enum(["LICHESS", "CHESSCOM"]).optional(),
  primaryRatingKey: z.enum(["rapid", "blitz", "bullet", "classical"]).optional(),
});

/** Set which provider / which time control drives the Elo chip. */
export async function PATCH(req: NextRequest) {
  const userId = await requireUser();
  const { primaryProvider, primaryRatingKey } = Patch.parse(await req.json());
  if (primaryProvider) {
    await prisma.$transaction([
      prisma.linkedAccount.updateMany({ where: { userId }, data: { isPrimary: false } }),
      prisma.linkedAccount.updateMany({ where: { userId, provider: primaryProvider }, data: { isPrimary: true } }),
    ]);
  }
  if (primaryRatingKey) await prisma.profile.update({ where: { userId }, data: { primaryRatingKey } });
  return NextResponse.json({ ok: true });
}

/** Disconnect: the gold ✓ comes off — chip reverts to unverified until re-linked. */
export async function DELETE(req: NextRequest) {
  const userId = await requireUser();
  const provider = req.nextUrl.searchParams.get("provider") as "LICHESS" | "CHESSCOM" | null;
  if (!provider) return NextResponse.json({ error: "provider required" }, { status: 400 });
  await prisma.linkedAccount.deleteMany({ where: { userId, provider } });
  const remaining = await prisma.linkedAccount.count({ where: { userId, verified: true } });
  if (remaining === 0) {
    await prisma.rating.updateMany({ where: { userId, clubId: null }, data: { verified: false, verifySource: null } });
  }
  return NextResponse.json({ ok: true, stillVerified: remaining > 0 });
}
