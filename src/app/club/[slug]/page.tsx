import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { ListRow, ListGroup } from "@/components/ui/ListRow";
import { JoinClubButton } from "@/components/club/JoinClubButton";
import { displayRating } from "@/lib/services/ratings";
import { parseId, label } from "@engine/game/timeControls";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const club = await prisma.club.findUnique({ where: { slug } });
  if (!club) return {};
  return {
    title: club.name,
    description: club.description ?? `${club.name} on GLYPH — tournaments, ratings, and community.`,
    openGraph: { title: club.name, images: club.bannerUrl ? [club.bannerUrl] : [] },
  };
}

const ONLINE_MS = 3 * 60 * 1000;

/**
 * A club.
 *
 * The previous version was styled with classes from a design system
 * this project never had — `bg-felt`, `font-score`, `bg-felt-bright` —
 * none of which exist in the Tailwind config, so most of the page
 * rendered unstyled. Its "Join club" was an anchor issuing a GET to a
 * POST-only route, which could only ever have produced a 405.
 *
 * What a club page is actually for: who is in the room, what is being
 * played, and what is coming up.
 */
export default async function ClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const [{ slug }, { invite }] = await Promise.all([params, searchParams]);

  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;

  const club = await prisma.club.findUnique({
    where: { slug },
    include: {
      _count: { select: { memberships: { where: { active: true } } } },
      tournaments: { orderBy: { createdAt: "desc" }, take: 5 },
      events: { where: { startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 3 },
    },
  });
  if (!club || (!club.isPublic && club.inviteCode !== invite)) notFound();

  const since = new Date(Date.now() - ONLINE_MS);

  const [members, membership] = await Promise.all([
    prisma.membership.findMany({
      where: { clubId: club.id, active: true },
      include: { user: { include: { profile: true, glyphRatings: true } } },
      orderBy: { joinedAt: "asc" },
      take: 60,
    }),
    userId
      ? prisma.membership.findFirst({ where: { userId, clubId: club.id, active: true } })
      : Promise.resolve(null),
  ]);

  const memberIds = members.map((m) => m.userId);

  // Games being played right now between members of this club.
  const liveGames = await prisma.liveGame.findMany({
    where: { status: "ACTIVE", whiteId: { in: memberIds }, blackId: { in: memberIds } },
    include: { white: { include: { profile: true } }, black: { include: { profile: true } } },
    orderBy: { lastMoveAt: "desc" },
    take: 6,
  });

  const online = members.filter(
    (m) => m.user.profile?.lastSeenAt && m.user.profile.lastSeenAt >= since,
  );

  const isMember = Boolean(membership);

  return (
    <div
      className="page-bottom"
      style={{ paddingTop: "var(--s5)", display: "flex", flexDirection: "column", gap: "var(--s6)" }}
    >
      <section style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s4)" }}>
          <span
            aria-hidden="true"
            style={{
              width: 56, height: 56, borderRadius: "var(--r-md)", flexShrink: 0,
              display: "grid", placeItems: "center",
              background: "var(--gold-wash)", color: "var(--gold)",
              border: "1px solid var(--border-gold)",
            }}
          >
            <Icon name="castle" size={28} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="font-display t-h1">{club.name}</h1>
            <p className="t-rowmeta">
              {club.city ? `${club.city}, ` : ""}{club.country ?? ""}
              {(club.city || club.country) && " · "}
              <span className="digits">{club._count.memberships}</span> members
            </p>
          </div>
        </div>

        {club.description && <p className="t-body">{club.description}</p>}

        {/* The room, right now. */}
        {online.length > 0 && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: "var(--s3)",
              padding: "var(--s2) var(--s3)", borderRadius: "var(--r-full)",
              background: "var(--surface)", border: "1px solid var(--border)",
            }}
          >
            <span style={{ display: "flex", flexShrink: 0 }}>
              {online.slice(0, 6).map((m, i) => (
                <span key={m.userId} style={{ marginLeft: i === 0 ? 0 : -9, display: "block" }}>
                  <Avatar name={m.user.profile?.fullName ?? "Member"} size={26} />
                </span>
              ))}
            </span>
            <span className="t-caption" style={{ color: "var(--text-muted)" }}>
              <span className="digits">{online.length}</span> here now
              {liveGames.length > 0 && (
                <> · <span className="digits">{liveGames.length}</span> game{liveGames.length === 1 ? "" : "s"} live</>
              )}
            </span>
            <span
              aria-hidden="true"
              style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: "50%", background: "var(--success)" }}
            />
          </div>
        )}

        {userId && !isMember && <JoinClubButton slug={slug} invite={invite} />}
        {isMember && (
          <p className="t-caption" style={{ color: "var(--gold)" }}>
            You are a member{membership?.role && membership.role !== "PLAYER" ? ` · ${membership.role.toLowerCase()}` : ""}.
          </p>
        )}
      </section>

      {liveGames.length > 0 && (
        <section>
          <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>Being played now</h2>
          <ListGroup>
            {liveGames.map((g) => {
              const { base, increment } = parseId(g.timeControl);
              return (
                <ListRow
                  key={g.id}
                  size="sm"
                  href={`/game/${g.id}`}
                  avatar={false}
                  icon={
                    <span style={{ display: "flex", flexShrink: 0 }}>
                      <Avatar name={g.white.profile?.fullName ?? "White"} size={30} />
                      <span style={{ marginLeft: -8, display: "block" }}>
                        <Avatar name={g.black.profile?.fullName ?? "Black"} size={30} />
                      </span>
                    </span>
                  }
                  name={`${g.white.profile?.fullName ?? "White"} vs ${g.black.profile?.fullName ?? "Black"}`}
                  meta={[
                    <span key="tc" className="digits">{label(base, increment)}</span>,
                    `move ${Math.ceil(g.sans.length / 2)}`,
                  ]}
                  action={<span className="t-caption" style={{ color: "var(--gold)", fontWeight: 600 }}>Watch</span>}
                />
              );
            })}
          </ListGroup>
        </section>
      )}

      <section>
        <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>Tournaments</h2>
        {club.tournaments.length === 0 ? (
          <div
            style={{
              textAlign: "center", padding: "var(--s8) var(--s4)",
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)",
            }}
          >
            <span style={{ color: "var(--text-dim)", display: "inline-block", marginBottom: "var(--s2)" }}>
              <Icon name="hourglass" size={26} />
            </span>
            <p className="t-secondary">No tournaments yet.</p>
          </div>
        ) : (
          <ListGroup>
            {club.tournaments.map((t) => (
              <ListRow
                key={t.id}
                size="sm"
                href={`/tournaments/${t.id}`}
                avatar={false}
                name={t.name}
                meta={[
                  t.format.toLowerCase(),
                  t.timeControlDetail ?? t.timeControl,
                  <span key="r" className="digits">Round {t.currentRound}/{t.totalRounds}</span>,
                ]}
                action={
                  <span
                    className="t-caption"
                    style={{
                      fontWeight: 600,
                      color: t.status === "IN_PROGRESS" ? "var(--gold)" : "var(--text-dim)",
                    }}
                  >
                    {t.status.replace("_", " ").toLowerCase()}
                  </span>
                }
              />
            ))}
          </ListGroup>
        )}
      </section>

      {club.events.length > 0 && (
        <section>
          <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>Coming up</h2>
          <ListGroup>
            {club.events.map((e) => (
              <ListRow
                key={e.id}
                size="sm"
                avatar={false}
                icon={
                  <span
                    aria-hidden="true"
                    style={{
                      width: 30, height: 30, borderRadius: "var(--r-md)", flexShrink: 0,
                      display: "grid", placeItems: "center",
                      background: "var(--surface-2)", color: "var(--text-muted)",
                    }}
                  >
                    <Icon name="timer" size={15} />
                  </span>
                }
                name={e.title}
                meta={[
                  e.type.toLowerCase(),
                  new Date(e.startsAt).toLocaleString(undefined, {
                    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                  }),
                ]}
              />
            ))}
          </ListGroup>
        </section>
      )}

      <section>
        <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>Members</h2>
        <ListGroup>
          {members.map((m) => {
            const isOnline = Boolean(m.user.profile?.lastSeenAt && m.user.profile.lastSeenAt >= since);
            const rapid = m.user.glyphRatings.find((r) => r.category === "RAPID");
            return (
              <ListRow
                key={m.userId}
                size="sm"
                href={m.user.profile?.handle ? `/profile/${m.user.profile.handle}` : undefined}
                name={m.user.profile?.fullName ?? "Member"}
                country={m.user.profile?.country}
                title={m.user.profile?.title}
                rating={displayRating(rapid)}
                meta={[
                  m.role !== "PLAYER" ? m.role.toLowerCase() : null,
                  isOnline ? <span key="on" style={{ color: "var(--success)" }}>online</span> : null,
                ]}
              />
            );
          })}
        </ListGroup>
        {club._count.memberships > members.length && (
          <p className="t-caption" style={{ marginTop: "var(--s2)" }}>
            Showing <span className="digits">{members.length}</span> of{" "}
            <span className="digits">{club._count.memberships}</span>.
          </p>
        )}
      </section>

      <Link
        href="/clubs"
        className="t-caption press"
        style={{ color: "var(--text-muted)", textDecoration: "none" }}
      >
        ← All clubs
      </Link>
    </div>
  );
}
