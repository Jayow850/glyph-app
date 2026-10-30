import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { clubContext, clubBadges } from "@/lib/services/clubContext";
import { ClubHeader } from "@/components/club/ClubHeader";
import { ClubTabs } from "@/components/club/ClubTabs";

/**
 * The club shell.
 *
 * Header and tabs live here so they survive navigation between
 * sections: moving from the table to the ladder re-renders only the
 * panel below, which is what makes five tabs cheaper than one page
 * rather than five times the work.
 */
export default async function ClubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;

  const ctx = await clubContext(slug, userId);
  if (!ctx) notFound();

  const { club, membership, isMember, organiser, onlineCount, liveCount } = ctx;

  // A private club stays private, and a layout cannot read the query
  // string, so it cannot see an invite code. Rather than 404 here and
  // break every invite link, the shell renders nothing of the club and
  // hands over to the tab, which can see ?invite= and decides whether
  // to show the club or 404. Nothing about a private club leaks from
  // this file.
  if (!club.isPublic && !isMember) return <>{children}</>;

  const badges = await clubBadges(club.id, userId, organiser);

  return (
    <div
      className="page-bottom"
      style={{ paddingTop: "var(--s5)", display: "flex", flexDirection: "column", gap: "var(--s4)" }}
    >
      <ClubHeader
        slug={slug}
        name={club.name}
        city={club.city}
        country={club.country}
        description={club.description}
        memberCount={club._count.memberships}
        onlineCount={onlineCount}
        liveCount={liveCount}
        role={membership?.role ?? null}
        isMember={isMember}
        canSignIn={Boolean(userId)}
        organiser={organiser}
      />

      <ClubTabs slug={slug} badges={badges} />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s6)" }}>{children}</div>
    </div>
  );
}
