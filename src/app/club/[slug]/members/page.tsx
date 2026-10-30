import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MemberList } from "@/components/club/MemberList";
import { displayRating } from "@/lib/services/ratings";
import { clubContext, ONLINE_MS } from "@/lib/services/clubContext";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await prisma.club.findUnique({ where: { slug }, select: { name: true } });
  return { title: club ? `${club.name} — members` : "Members" };
}

/** How officers are ranked against each other. Service, then rating. */
const ROLE_ORDER: Record<string, number> = {
  OWNER: 0,
  PRESIDENT: 1,
  VICE_PRESIDENT: 2,
  COMPETITION_SECRETARY: 3,
  SECRETARY: 4,
  TREASURER: 5,
  ADMIN: 6,
  ORGANIZER: 7,
  ARBITER: 8,
  COACH: 9,
  PARENT: 10,
  PLAYER: 11,
};

/**
 * MEMBERS — everybody, with the officers at the top.
 *
 * Service to a club is unpaid and mostly invisible, so the people who
 * do it are named first and by title. Everyone below them sorts by
 * whatever the reader is actually looking for.
 */
export default async function ClubMembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;

  const ctx = await clubContext(slug, userId);
  if (!ctx) notFound();
  const { club, isMember } = ctx;
  if (!club.isPublic && !isMember) notFound();

  const since = new Date(Date.now() - ONLINE_MS);

  const rows = await prisma.membership.findMany({
    where: { clubId: club.id, active: true },
    select: {
      userId: true,
      role: true,
      joinedAt: true,
      user: {
        select: {
          profile: {
            select: { fullName: true, handle: true, country: true, title: true, lastSeenAt: true },
          },
          glyphRatings: { select: { category: true, rating: true, rd: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  const members = rows.map((m) => {
    const rapid = m.user.glyphRatings.find((r) => r.category === "RAPID") ?? null;
    return {
      userId: m.userId,
      name: m.user.profile?.fullName ?? "Member",
      handle: m.user.profile?.handle ?? null,
      country: m.user.profile?.country ?? null,
      title: m.user.profile?.title ?? null,
      role: m.role,
      roleRank: ROLE_ORDER[m.role] ?? 99,
      rating: rapid ? Math.round(rapid.rating) : null,
      ratingLabel: displayRating(rapid),
      online: Boolean(m.user.profile?.lastSeenAt && m.user.profile.lastSeenAt >= since),
      lastSeenAt: m.user.profile?.lastSeenAt?.toISOString() ?? null,
      joinedAt: m.joinedAt.toISOString(),
    };
  });

  return <MemberList members={members} />;
}
