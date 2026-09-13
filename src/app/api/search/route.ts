import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Chess-typed search. Returns grouped results: people, clubs, posts (clips/games/puzzles),
 * openings. `q` empty → trending + suggested. Substring matches are case-insensitive.
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

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const tab = req.nextUrl.searchParams.get("tab") ?? "top";

  if (!q) {
    const suggested = await prisma.user.findMany({
      take: 5,
      include: { profile: true, ratings: { where: { clubId: null, timeControl: "RAPID" } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ trending: TRENDING, suggested, openings: OPENINGS.slice(0, 3) });
  }

  const like = { contains: q, mode: "insensitive" as const };
  const [people, clubs, posts] = await Promise.all([
    (tab === "top" || tab === "people")
      ? prisma.user.findMany({ where: { OR: [{ name: like }, { profile: { handle: like } }] }, take: 10, include: { profile: true, ratings: { where: { clubId: null, timeControl: "RAPID" } }, _count: { select: { followers: true } } } })
      : [],
    (tab === "top" || tab === "clubs")
      ? prisma.club.findMany({ where: { OR: [{ name: like }, { slug: like }] }, take: 10, include: { _count: { select: { memberships: true } } } })
      : [],
    (tab === "top" || tab === "clips" || tab === "games" || tab === "puzzles")
      ? prisma.post.findMany({
          where: {
            archived: false, visibility: "PUBLIC",
            body: like,
            ...(tab === "clips" ? { type: "CLIP" } : tab === "games" ? { type: "GAME" } : tab === "puzzles" ? { type: "PUZZLE" } : {}),
          },
          take: 20, orderBy: { viewCount: "desc" },
          include: { author: { include: { profile: true } } },
        })
      : [],
  ]);
  const openings = OPENINGS.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()) || o.eco.toLowerCase().includes(q.toLowerCase()));
  return NextResponse.json({ people, clubs, posts, openings });
}
