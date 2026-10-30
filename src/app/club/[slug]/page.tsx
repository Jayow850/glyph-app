import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/ui/Avatar";
import { ListRow, ListGroup } from "@/components/ui/ListRow";
import { Icon } from "@/components/ui/Icon";
import { JoinClubButton } from "@/components/club/JoinClubButton";
import { FirstWeekCard } from "@/components/club/FirstWeekCard";
import { WelcomeButton } from "@/components/club/WelcomeButton";
import { ClubNightCard } from "@/components/club/ClubNightCard";
import { GamesOwed } from "@/components/season/GamesOwed";
import { Panel, PanelSkeleton } from "@/components/club/Panel";
import { firstWeekFor, HOST_DAYS } from "@/lib/services/onboarding";
import { clubNightFor } from "@/lib/services/clubnight";
import { currentSeason, halfAt } from "@/lib/services/season";
import { leagueTable, gamesOwed } from "@/lib/services/league";
import { ladder } from "@/lib/services/ladder";
import { clubContext, FOUNDING_MS } from "@/lib/services/clubContext";
import { parseId, label } from "@engine/game/timeControls";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await prisma.club.findUnique({ where: { slug } });
  if (!club) return {};
  return {
    title: club.name,
    description: club.description ?? `${club.name} on GLYPH — tournaments, ratings, and community.`,
    openGraph: { title: club.name, images: club.bannerUrl ? [club.bannerUrl] : [] },
  };
}

/**
 * NOW — what is happening, and what needs me.
 *
 * The default tab, and the only one with no history in it. A member
 * opening the club should see the things they can act on today above
 * everything the club has ever done; the table, the ladder and the
 * cabinet are each one tap away and none of them change hourly.
 *
 * Every panel below loads on its own. The club night and the live
 * games come from different queries of very different cost, and before
 * the split the slowest of the fifteen decided when any of them
 * appeared.
 */
export default async function ClubNowPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const [{ slug }, { invite }] = await Promise.all([params, searchParams]);

  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;

  const ctx = await clubContext(slug, userId);
  if (!ctx) notFound();

  const { club, isMember, organiser } = ctx;
  // The layout cannot read ?invite=, so the private-club gate lives
  // here. An invite code shows the club; nothing else does.
  if (!club.isPublic && !isMember && club.inviteCode !== invite) notFound();

  // Shown without the shell, because the layout bowed out for a
  // private club it could not verify.
  const bare = !club.isPublic && !isMember;

  return (
    <>
      {bare && (
        <div style={{ paddingTop: "var(--s5)", display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
          <h1 className="font-display t-h1">{club.name}</h1>
          <p className="t-body">You have been invited to join this club.</p>
          {userId ? (
            <JoinClubButton slug={slug} invite={invite} />
          ) : (
            <Link href="/signin" className="t-secondary" style={{ color: "var(--gold)", fontWeight: 600 }}>
              Sign in to join
            </Link>
          )}
        </div>
      )}

      {!bare && (
        <>
          <Suspense fallback={<PanelSkeleton rows={2} />}>
            <WaitingOnYou slug={slug} clubId={club.id} userId={userId} isMember={isMember} />
          </Suspense>

          <Suspense fallback={<PanelSkeleton rows={1} />}>
            <NextClubNight slug={slug} clubId={club.id} clubName={club.name} userId={userId} isMember={isMember} organiser={organiser} />
          </Suspense>

          <Suspense fallback={null}>
            <Newcomer slug={slug} clubId={club.id} clubName={club.name} userId={userId} isMember={isMember} />
          </Suspense>

          <Suspense fallback={<PanelSkeleton rows={2} />}>
            <BeingPlayed clubId={club.id} />
          </Suspense>

          <Suspense fallback={<PanelSkeleton rows={3} />}>
            <ClubFeed clubId={club.id} />
          </Suspense>

          {organiser && (
            <Suspense fallback={null}>
              <NeedWelcome clubId={club.id} clubCreatedAt={club.createdAt} />
            </Suspense>
          )}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Anything with my name on it.
 *
 * A ladder challenge, a league game I owe. This panel is the reason
 * the tab is called NOW rather than "home", and it renders nothing at
 * all when there is nothing — an empty "waiting on you" is worse than
 * no panel, because it trains people to stop reading it.
 */
async function WaitingOnYou({
  slug, clubId, userId, isMember,
}: {
  slug: string; clubId: string; userId: string | null; isMember: boolean;
}) {
  if (!userId || !isMember) return null;

  const season = await currentSeason(clubId);
  const half = season ? halfAt(season) : null;

  const [rungs, divisions] = await Promise.all([
    ladder(clubId),
    season
      ? prisma.division.findMany({
          where: { seasonId: season.id, half: half! },
          orderBy: { tier: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const mine = rungs.find((r) => r.userId === userId) ?? null;

  const tables = await Promise.all(divisions.map((d) => leagueTable(d.id)));
  const yourDivision = divisions.find((d, i) => tables[i].some((r) => r.userId === userId));
  const owed = yourDivision ? await gamesOwed(yourDivision.id, userId) : [];

  const challenge = mine?.openChallenge ?? null;
  if (!challenge && owed.length === 0) return null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
      <h2 className="section-label">Waiting on you</h2>

      {challenge && (
        <Link
          href={`/club/${slug}/play`}
          className="press"
          style={{
            display: "flex", alignItems: "center", gap: "var(--s3)",
            padding: "var(--s3) var(--s4)", minHeight: 56,
            background: "var(--surface)", border: "1px solid var(--border-gold)",
            borderRadius: "var(--r-lg)", textDecoration: "none", color: "inherit",
          }}
        >
          <span aria-hidden="true" style={{ color: "var(--gold)", flexShrink: 0 }}>
            <Icon name="swords" size={18} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="t-row" style={{ display: "block" }}>
              {challenge.state === "ACCEPTED"
                ? `Your ladder game with ${challenge.otherName}`
                : challenge.role === "defender"
                  ? `${challenge.otherName} has challenged you`
                  : `You challenged ${challenge.otherName}`}
            </span>
            <span className="t-rowmeta" style={{ display: "block" }}>
              {challenge.state === "ACCEPTED"
                ? "Report the result when you have played"
                : challenge.role === "defender"
                  ? "Accept or decline on the Play tab"
                  : "Waiting for them to answer"}
            </span>
          </span>
          <Icon name="chevronRight" size={16} />
        </Link>
      )}

      {yourDivision && owed.length > 0 && (
        <GamesOwed
          divisionName={yourDivision.name}
          fixtures={owed.map((f) => ({
            ...f,
            dueBy: f.dueBy ? f.dueBy.toISOString() : null,
            arrangedAt: f.arrangedAt ? f.arrangedAt.toISOString() : null,
          }))}
        />
      )}
    </section>
  );
}

async function NextClubNight({
  slug, clubId, clubName, userId, isMember, organiser,
}: {
  slug: string; clubId: string; clubName: string;
  userId: string | null; isMember: boolean; organiser: boolean;
}) {
  const clubNight = await clubNightFor(clubId, userId);
  if (!clubNight) {
    return organiser ? (
      <Panel
        title="No club night set"
        body="A weekly night is the thing a club is built around. Set one on the Play tab."
        href={`/club/${slug}/play`}
        cta="Set the club night"
      />
    ) : null;
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
      <h2 className="section-label">Next club night</h2>
      <ClubNightCard
        id={clubNight.id}
        clubSlug={slug}
        clubName={clubName}
        startsAt={clubNight.startsAt.toISOString()}
        timeControl={clubNight.timeControl}
        rounds={clubNight.rounds}
        state={clubNight.state}
        tournamentId={clubNight.tournamentId}
        going={clubNight.going}
        maybe={clubNight.maybe}
        yourState={isMember ? clubNight.yourState : null}
        canRsvp={isMember}
        startable={clubNight.startable}
        canStart={Boolean(organiser)}
      />
    </section>
  );
}

/** The newcomer's own first week, and whoever is looking after them. */
async function Newcomer({
  slug, clubId, clubName, userId, isMember,
}: {
  slug: string; clubId: string; clubName: string; userId: string | null; isMember: boolean;
}) {
  if (!userId || !isMember) return null;

  const firstWeek = await firstWeekFor(clubId, userId);
  if (!firstWeek || firstWeek.done) return null;

  const host = firstWeek.hostId
    ? await prisma.user.findUnique({
        where: { id: firstWeek.hostId },
        select: { profile: { select: { fullName: true, handle: true, country: true, title: true } } },
      })
    : null;

  return (
    <>
      <FirstWeekCard
        clubSlug={slug}
        clubName={clubName}
        day={firstWeek.day}
        pickedTimeControl={firstWeek.pickedTimeControl}
        playedClubGame={firstWeek.playedClubGame}
        metMembers={firstWeek.metMembers}
        done={firstWeek.done}
      />

      {host && (
        <section>
          <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>Your host this week</h2>
          <ListGroup>
            <ListRow
              size="sm"
              name={host.profile?.fullName ?? "A member"}
              country={host.profile?.country}
              title={host.profile?.title}
              meta={["here to help you settle in"]}
              action={
                host.profile?.handle ? (
                  <Link
                    href={`/profile/${host.profile.handle}`}
                    className="t-caption press"
                    style={{ color: "var(--gold)", fontWeight: 600, textDecoration: "none" }}
                  >
                    Say hello
                  </Link>
                ) : null
              }
            />
          </ListGroup>
        </section>
      )}
    </>
  );
}

async function BeingPlayed({ clubId }: { clubId: string }) {
  const games = await prisma.liveGame.findMany({
    where: {
      status: "ACTIVE",
      // A move has been played. `status: ACTIVE` alone counts boards
      // created and never touched, which is how "3 games live" came to
      // mean three games at move 0.
      sans: { isEmpty: false },
      white: { memberships: { some: { clubId, active: true } } },
      black: { memberships: { some: { clubId, active: true } } },
    },
    select: {
      id: true, timeControl: true, sans: true,
      white: { select: { profile: { select: { fullName: true } } } },
      black: { select: { profile: { select: { fullName: true } } } },
    },
    orderBy: { lastMoveAt: "desc" },
    take: 6,
  });
  if (games.length === 0) return null;

  return (
    <section>
      <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>Being played now</h2>
      <ListGroup>
        {games.map((g) => {
          const { base, increment } = parseId(g.timeControl);
          const w = g.white.profile?.fullName ?? "White";
          const b = g.black.profile?.fullName ?? "Black";
          return (
            <ListRow
              key={g.id}
              size="sm"
              href={`/game/${g.id}`}
              avatar={false}
              icon={
                <span style={{ display: "flex", flexShrink: 0 }}>
                  <Avatar name={w} size={30} />
                  <span style={{ marginLeft: -8, display: "block" }}>
                    <Avatar name={b} size={30} />
                  </span>
                </span>
              }
              name={`${w} vs ${b}`}
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
  );
}

/**
 * What the club has been doing.
 *
 * Results, welcomes, promotions and trophy awards all arrive here as
 * posts, so a member who was away for a week can catch up in one
 * column. A club with no feed is a noticeboard nobody pins anything to.
 */
async function ClubFeed({ clubId }: { clubId: string }) {
  const posts = await prisma.post.findMany({
    where: { clubId, type: { in: ["MILESTONE", "WELCOME", "GAME", "BRILLIANCY", "TEXT"] } },
    select: {
      id: true, type: true, body: true, createdAt: true,
      author: { select: { profile: { select: { fullName: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  if (posts.length === 0) return null;

  return (
    <section>
      <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>Lately</h2>
      <div
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", overflow: "hidden",
        }}
      >
        {posts.map((p, i) => (
          <Link
            key={p.id}
            href={`/feed#${p.id}`}
            className="press"
            style={{
              display: "flex", gap: "var(--s3)", padding: "var(--s3) var(--s4)",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
              textDecoration: "none", color: "inherit",
            }}
          >
            <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: "var(--text-dim)" }}>
              <Icon name={p.type === "WELCOME" ? "users" : p.type === "MILESTONE" ? "flag" : "swords"} size={15} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="t-secondary" style={{ display: "block", overflowWrap: "break-word" }}>
                {p.body ?? "—"}
              </span>
              <span className="t-caption" style={{ display: "block", color: "var(--text-dim)" }}>
                {ago(p.createdAt)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Organizers only: who arrived and still needs something doing. */
async function NeedWelcome({ clubId, clubCreatedAt }: { clubId: string; clubCreatedAt: Date }) {
  const newThisWeek = await prisma.membership.findMany({
    where: {
      clubId,
      active: true,
      joinedAt: {
        gte: new Date(Date.now() - HOST_DAYS * 86_400_000),
        // Everyone present when the club was created joined in the same
        // instant as the club itself. They are founding members, not
        // newcomers to be welcomed.
        gt: new Date(clubCreatedAt.getTime() + FOUNDING_MS),
      },
      role: { notIn: ["OWNER", "PRESIDENT"] },
    },
    select: {
      userId: true, joinedAt: true, welcomedAt: true,
      user: { select: { profile: { select: { fullName: true, country: true, title: true } } } },
    },
    orderBy: { joinedAt: "desc" },
  });
  if (newThisWeek.length === 0) return null;

  const newIds = newThisWeek.map((m) => m.userId);

  const [played, welcomePosts] = await Promise.all([
    prisma.liveGame.findMany({
      where: {
        // Same trap as the live-games query: a game that exists is not
        // a game that was played.
        sans: { isEmpty: false },
        OR: [{ whiteId: { in: newIds } }, { blackId: { in: newIds } }],
      },
      select: { whiteId: true, blackId: true },
    }),
    prisma.post.findMany({
      where: { clubId, type: "WELCOME", subjectUserId: { in: newIds } },
      select: { id: true, subjectUserId: true, _count: { select: { reactions: true } } },
    }),
  ]);

  const playedIds = new Set(played.flatMap((g) => [g.whiteId, g.blackId]));
  const postFor = new Map(welcomePosts.map((p) => [p.subjectUserId, p]));

  // Only the ones who need chasing. A list where every row is fine is
  // a list with nothing to say.
  const needWelcome = newThisWeek.filter(
    (m) => !m.welcomedAt || !playedIds.has(m.userId),
  );
  if (needWelcome.length === 0) return null;

  return (
    <section>
      <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>New members this week</h2>
      <ListGroup>
        {needWelcome.map((m) => {
          const post = postFor.get(m.userId);
          const hasPlayed = playedIds.has(m.userId);
          const days = Math.floor((Date.now() - m.joinedAt.getTime()) / 86_400_000);
          return (
            <ListRow
              key={m.userId}
              size="sm"
              name={m.user.profile?.fullName ?? "A new member"}
              country={m.user.profile?.country}
              title={m.user.profile?.title}
              highlight={!hasPlayed}
              meta={[
                days === 0 ? "joined today" : `joined ${days}d ago`,
                m.welcomedAt ? "welcomed" : <span key="nw" style={{ color: "var(--gold)" }}>not welcomed</span>,
                hasPlayed ? "has played" : <span key="np" style={{ color: "var(--danger)" }}>no games yet</span>,
              ]}
              action={
                post && !m.welcomedAt ? (
                  <WelcomeButton postId={post.id} count={post._count.reactions} compact />
                ) : null
              }
            />
          );
        })}
      </ListGroup>
    </section>
  );
}

function ago(at: Date) {
  const mins = Math.floor((Date.now() - at.getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}
