import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Chess-typed search. Returns grouped results: people, clubs, posts (clips/games/puzzles),
 * openings. `q` empty → trending + suggested. Substring matches are case-insensitive.
 *
 * SECURITY — why every query here uses `select` and never `include`:
 *
 * `prisma.user.findMany({ include: { profile: true } })` returns EVERY
 * scalar column on User, and User carries `email`, `passwordHash`,
 * `isMinor`, `bannedAt` and `banReason`. This route has no auth gate, so
 * that shape published the email address and bcrypt hash of real accounts
 * to anyone who sent a GET — with no query string at all, the five newest
 * sign-ups.
 *
 * The rule, everywhere a response can reach a browser: name the fields.
 * `include` on a user relation is never correct in an API response.
 */

const OPENINGS = [
  { name: "Sicilian Najdorf", eco: "B90" },
  { name: "Ruy López", eco: "C60" },
  { name: "London System", eco: "D02" },
  { name: "Queen's Gambit", eco: "D06" },
  { name: "King's Indian Defense", eco: "E60" },
  { name: "Caro-Kann", eco: "B10" },
];
const TRENDING = ["Najdorf trap", "GM simul", "match night", "endgame technique", "blunder compilation"];

/** The only shape of a person this endpoint is allowed to emit. */
const PERSON = {
  userId: true,
  fullName: true,
  handle: true,
  country: true,
  title: true,
  avatarUrl: true,
} as const;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const tab = req.nextUrl.searchParams.get("tab") ?? "top";

  if (!q) {
    // Newest profiles, not newest users: a Profile row carries nothing
    // that has to be kept back.
    const suggested = await prisma.profile.findMany({
      take: 5,
      select: PERSON,
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ trending: TRENDING, suggested, openings: OPENINGS.slice(0, 3) });
  }

  const like = { contains: q, mode: "insensitive" as const };
  const [people, clubs, posts] = await Promise.all([
    tab === "top" || tab === "people"
      ? prisma.profile.findMany({
          where: { OR: [{ fullName: like }, { handle: like }] },
          take: 10,
          select: PERSON,
        })
      : [],
    tab === "top" || tab === "clubs"
      ? prisma.club.findMany({
          // Private clubs stay out of search; they are found by invite.
          where: { isPublic: true, OR: [{ name: like }, { slug: like }] },
          take: 10,
          select: {
            id: true, slug: true, name: true, city: true, country: true, logoUrl: true,
            _count: { select: { memberships: true } },
          },
        })
      : [],
    tab === "top" || tab === "clips" || tab === "games" || tab === "puzzles"
      ? prisma.post.findMany({
          where: {
            archived: false,
            visibility: "PUBLIC",
            body: like,
            ...(tab === "clips"
              ? { type: "CLIP" as const }
              : tab === "games"
                ? { type: "GAME" as const }
                : tab === "puzzles"
                  ? { type: "PUZZLE" as const }
                  : {}),
          },
          take: 20,
          orderBy: { viewCount: "desc" },
          select: {
            id: true, type: true, body: true, viewCount: true, createdAt: true,
            author: { select: { profile: { select: PERSON } } },
          },
        })
      : [],
  ]);

  const openings = OPENINGS.filter(
    (o) =>
      o.name.toLowerCase().includes(q.toLowerCase()) ||
      o.eco.toLowerCase().includes(q.toLowerCase()),
  );
  return NextResponse.json({ people, clubs, posts, openings });
}
