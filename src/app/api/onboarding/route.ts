import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { claimRating } from "@/lib/services/verification";

/**
 * Onboarding in one call: feel, imported rating ("you arrive with your
 * reputation"), three loves, optional club join, optional first post.
 */
const Body = z.object({
  feel: z.enum(["LEARNING", "CLUB_PLAYER", "GRINDER", "COACH", "CREATOR", "RETURNING"]),
  importedRating: z.number().int().min(100).max(3200).optional(),
  importSource: z.enum(["LICHESS", "CHESSCOM"]).optional(),
  loves: z.array(z.string()).length(3),
  joinClubSlug: z.string().optional(),
  firstPost: z.string().max(5000).optional(),
});

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const b = Body.parse(await req.json());

  if (b.importedRating) {
    // Verified only with an import source; manual claims are capped + provisional.
    await claimRating(userId, b.importedRating, b.importSource);
  }

  await prisma.profile.update({
    where: { userId },
    data: { bio: `${b.feel.toLowerCase().replace("_", " ")} · loves ${b.loves.join(", ")}` },
  }).catch(() => {});

  if (b.joinClubSlug) {
    const club = await prisma.club.findUnique({ where: { slug: b.joinClubSlug } });
    if (club) {
      await prisma.membership.upsert({
        where: { userId_clubId: { userId, clubId: club.id } },
        create: { userId, clubId: club.id, role: "PLAYER" },
        update: { active: true },
      });
    }
  }

  let post = null;
  if (b.firstPost?.trim()) {
    post = await prisma.post.create({ data: { authorId: userId, type: "TEXT", body: b.firstPost } });
  }
  return NextResponse.json({ ok: true, post });
}
