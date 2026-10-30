import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { ListRow, ListGroup } from "@/components/ui/ListRow";
import { JoinClubButton } from "@/components/club/JoinClubButton";
import { FirstWeekCard } from "@/components/club/FirstWeekCard";
import { WelcomeButton } from "@/components/club/WelcomeButton";
import { firstWeekFor, HOST_DAYS } from "@/lib/services/onboarding";
import { ClubNightCard } from "@/components/club/ClubNightCard";
import { ClubNightForm } from "@/components/club/ClubNightForm";
import { clubNightFor } from "@/lib/services/clubnight";
import { currentSeason, seasonTable, halfAt } from "@/lib/services/season";
import { leagueTable, gamesOwed } from "@/lib/services/league";
import { SeasonHome } from "@/components/season/SeasonHome";
import { LeagueTable } from "@/components/season/LeagueTable";
import { GamesOwed } from "@/components/season/GamesOwed";
import { OrganiserPanel } from "@/components/season/OrganiserPanel";
import { canRunCompetitions, canAwardHonours } from "@/lib/services/officers";
import { ladder, rulesOf } from "@/lib/services/ladder";
import { LadderBoard } from "@/components/ladder/LadderBoard";
import { LadderRules } from "@/components/ladder/LadderRules";
import { trophyCabinet } from "@/lib/services/trophies";
import { TrophyCabinet } from "@/components/trophy/TrophyCabinet";
import { TrophyForm } from "@/components/trophy/TrophyForm";
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
 * Anyone whose membership predates this is a founding member.
 *
 * A club and its first roster are written in one transaction, so their
 * joinedAt values land milliseconds apart. Two minutes is far wider
 * than that gap and far narrower than a real person joining later.
 */
const FOUNDING_MS = 2 * 60 * 1000;

/**
 * Drop the club's own name from a tournament title.
 *
 * Club nights are named "<Club> club night — 30 Oct" so they read
 * correctly in a global list. Inside the club's own page the prefix is
 * redundant, and at 360px it ate the whole row and truncated the date,
 * which is the only part that distinguishes one club night from the
 * next. Stripped on render, so the stored name stays useful elsewhere.
 */
function stripClubName(title: string, clubName: string) {
  const trimmed = title.startsWith(clubName) ? title.slice(clubName.length) : title;
  const cleaned = trimmed.replace(/^[\s—–-]+/, "").trim();
  if (!cleaned) return title;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

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
  //
  // `status: ACTIVE` alone is not "live": a game is ACTIVE from the
  // moment it is created, so three boards nobody ever moved on were
  // being counted and shown at move 0. A game is live once a move has
  // been played on it and it has not finished.
  const liveGames = await prisma.liveGame.findMany({
    where: {
      status: "ACTIVE",
      sans: { isEmpty: false },
      whiteId: { in: memberIds },
      blackId: { in: memberIds },
    },
    include: { white: { include: { profile: true } }, black: { include: { profile: true } } },
    orderBy: { lastMoveAt: "desc" },
    take: 6,
  });

  const online = members.filter(
    (m) => m.user.profile?.lastSeenAt && m.user.profile.lastSeenAt >= since,
  );

  const isMember = Boolean(membership);
  const organiser = canRunCompetitions(membership?.role);
  const canClose = canAwardHonours(membership?.role);

  // The newcomer's own view, and the organizer's view of newcomers.
  const [firstWeek, newThisWeek, clubNight] = await Promise.all([
    userId && isMember ? firstWeekFor(club.id, userId) : Promise.resolve(null),
    organiser
      ? prisma.membership.findMany({
          where: {
            clubId: club.id,
            active: true,
            joinedAt: {
              gte: new Date(Date.now() - HOST_DAYS * 86_400_000),
              // Everyone present when the club was created — the owner
              // and any seeded roster — joined in the same instant as
              // the club itself. They are the founding members, not
              // newcomers to be welcomed, and listing all eight of them
              // was the whole of this bug.
              gt: new Date(club.createdAt.getTime() + FOUNDING_MS),
            },
            // An owner welcoming themselves is nonsense in any case.
            role: { notIn: ["OWNER", "PRESIDENT"] },
          },
          include: { user: { include: { profile: true } } },
          orderBy: { joinedAt: "desc" },
        })
      : Promise.resolve([]),
    clubNightFor(club.id, userId),
  ]);

  // The cabinet by the door, and the ladder beside it.
  const [trophies, rungs] = await Promise.all([
    trophyCabinet(club.id),
    ladder(club.id),
  ]);
  const ladderRules = rulesOf(club);

  // ---- The season, and everything that reports into it ----
  const season = await currentSeason(club.id);
  const half = season ? halfAt(season) : null;

  const [seasonRows, divisions] = season
    ? await Promise.all([
        seasonTable(season.id),
        prisma.division.findMany({
          where: { seasonId: season.id, half: half! },
          orderBy: { tier: "asc" },
        }),
      ])
    : [[], []];

  // One table per division, plus the fixtures this member still owes.
  const tables = await Promise.all(divisions.map((d) => leagueTable(d.id)));
  const yourDivision = userId
    ? divisions.find((d, i) => tables[i].some((r) => r.userId === userId))
    : undefined;
  const owed = yourDivision && userId ? await gamesOwed(yourDivision.id, userId) : [];

  const championshipRow = season
    ? await prisma.championship.findUnique({ where: { seasonId: season.id } })
    : null;
  const nameOf = (id: string | null | undefined) =>
    id ? (seasonRows.find((r) => r.userId === id)?.name ?? null) : null;

  // Everyone an officer could place in a division, strongest rating first.
  const allocatable = organiser
    ? members.map((m) => ({
        userId: m.userId,
        name: m.user.profile?.fullName ?? "A member",
        rating:
          m.user.glyphRatings?.find((r) => r.category === "RAPID")?.rating != null
            ? Math.round(m.user.glyphRatings.find((r) => r.category === "RAPID")!.rating)
            : null,
      }))
    : [];

  // Which of them have actually played — the ones who have not are the
  // people a club loses, and they are the only ones worth chasing.
  const newIds = newThisWeek.map((m) => m.userId);
  // Same trap as the live-games query: a game that exists is not a
  // game that was played, and counting created-but-untouched boards
  // marked every newcomer "has played" — which switched off the one
  // signal this section exists to give.
  const playedIds = new Set(
    newIds.length
      ? (
          await prisma.liveGame.findMany({
            where: {
              sans: { isEmpty: false },
              OR: [{ whiteId: { in: newIds } }, { blackId: { in: newIds } }],
            },
            select: { whiteId: true, blackId: true },
          })
        ).flatMap((g) => [g.whiteId, g.blackId])
      : [],
  );

  const welcomePosts = newIds.length
    ? await prisma.post.findMany({
        where: { clubId: club.id, type: "WELCOME", subjectUserId: { in: newIds } },
        select: { id: true, subjectUserId: true, _count: { select: { reactions: true } } },
      })
    : [];
  const welcomePostFor = new Map(welcomePosts.map((p) => [p.subjectUserId, p]));

  // The newcomers who actually need something doing: nobody has
  // welcomed them, or they have not played yet.
  const needWelcome = newThisWeek.filter(
    (m) => !welcomePostFor.get(m.userId) || !playedIds.has(m.userId),
  );

  const host = firstWeek?.hostId
    ? members.find((m) => m.userId === firstWeek.hostId)?.user ?? null
    : null;

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

      {/* The officer's drawer: open a season, name the divisions, place
          people, settle a half. Collapsed, because a club page is for
          members and the machinery belongs out of the way. */}
      {organiser && (
        <OrganiserPanel
          clubSlug={slug}
          season={
            season
              ? {
                  id: season.id,
                  name: season.name,
                  startsAt: season.startsAt.toISOString(),
                  halfwayAt: season.halfwayAt.toISOString(),
                  endsAt: season.endsAt.toISOString(),
                }
              : null
          }
          half={half}
          members={allocatable}
          hasDivisions={divisions.length > 0}
          canClose={canClose}
        />
      )}

      {/* Where the club is in its year. Above the weekly night because a
          season is the frame everything else sits inside. */}
      {season && (
        <SeasonHome
          name={season.name}
          startsAt={season.startsAt}
          halfwayAt={season.halfwayAt}
          endsAt={season.endsAt}
          half={half!}
          table={seasonRows}
          youId={userId}
          championship={
            championshipRow
              ? {
                  autumnWinnerName: nameOf(championshipRow.autumnWinnerId),
                  springWinnerName: nameOf(championshipRow.springWinnerId),
                  outright: championshipRow.outright,
                  championName: nameOf(championshipRow.championId),
                  decidedBy: championshipRow.decidedBy,
                }
              : null
          }
        />
      )}

      {/* What you still owe. Before the tables, because it is the only
          part of a league a member has to act on. */}
      {isMember && yourDivision && owed.length > 0 && (
        <GamesOwed
          divisionName={yourDivision.name}
          fixtures={owed.map((f) => ({
            ...f,
            dueBy: f.dueBy ? f.dueBy.toISOString() : null,
            arrangedAt: f.arrangedAt ? f.arrangedAt.toISOString() : null,
          }))}
        />
      )}

      {/* The noticeboard. In a real club this is paper on a wall and it
          is checked constantly, so it is always current and always here. */}
      {divisions.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
          <h2 className="section-label">
            {half === "AUTUMN" ? "Autumn" : "Spring"} league
          </h2>
          {divisions.map((d, i) => (
            <LeagueTable
              key={d.id}
              name={d.name}
              rows={tables[i]}
              youId={userId}
              promoteCount={d.promoteCount}
              relegateCount={d.relegateCount}
              showMovement={divisions.length > 1}
            />
          ))}
        </section>
      )}

      {/* The weekly night, and — for organisers — the controls to set it.
          A club with no night gets a prompt rather than silence, because
          an empty space teaches nobody that the feature exists. */}
      {(clubNight || organiser) && (
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
          {clubNight && (
            <ClubNightCard
              id={clubNight.id}
              clubSlug={slug}
              clubName={club.name}
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
          )}
          {organiser && (
            <ClubNightForm
              clubSlug={slug}
              initial={
                clubNight
                  ? {
                      dayOfWeek: clubNight.dayOfWeek,
                      startsAt: clubNight.startsAt.toISOString(),
                      timeControl: clubNight.timeControl,
                      rounds: clubNight.rounds,
                    }
                  : null
              }
            />
          )}
        </section>
      )}

      {firstWeek && !firstWeek.done && (
        <FirstWeekCard
          clubSlug={slug}
          clubName={club.name}
          day={firstWeek.day}
          pickedTimeControl={firstWeek.pickedTimeControl}
          playedClubGame={firstWeek.playedClubGame}
          metMembers={firstWeek.metMembers}
          done={firstWeek.done}
        />
      )}

      {/* Somebody is responsible for you this week, by name. */}
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

      {/* Organizers only: who arrived, and who nobody has spoken to.
          Hidden once every newcomer has been welcomed AND played —
          the section exists to point at people who need chasing, and
          a list where every row is fine is a list with nothing to say. */}
      {organiser && needWelcome.length > 0 && (
        <section>
          <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>New members this week</h2>
          <ListGroup>
            {needWelcome.map((m) => {
              const post = welcomePostFor.get(m.userId);
              const played = playedIds.has(m.userId);
              const days = Math.floor((Date.now() - m.joinedAt.getTime()) / 86_400_000);
              return (
                <ListRow
                  key={m.userId}
                  size="sm"
                  name={m.user.profile?.fullName ?? "A new member"}
                  country={m.user.profile?.country}
                  title={m.user.profile?.title}
                  highlight={!played}
                  meta={[
                    days === 0 ? "joined today" : `joined ${days}d ago`,
                    m.welcomedAt ? "welcomed" : <span key="nw" style={{ color: "var(--gold)" }}>not welcomed</span>,
                    played
                      ? "has played"
                      : <span key="np" style={{ color: "var(--danger)" }}>no games yet</span>,
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
      )}

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

      {/* The trophy cabinet. An empty one still shows to members, the
          way the ladder does: gating the empty state on who may fill it
          meant a member saw no Trophies heading at all and no way to
          know the feature existed. */}
      {(trophies.length > 0 || isMember) && (
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
          <h2 className="section-label">Trophies</h2>
          <TrophyCabinet clubSlug={club.slug} trophies={trophies} canAdd={canClose} />
          {canClose && <TrophyForm clubSlug={club.slug} />}
        </section>
      )}

      {/* The ladder. Shown to members, and to anyone once it has names
          on it — a visitor should be able to see who is at the top. */}
      {(rungs.length > 0 || isMember) && (
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
          <h2 className="section-label">Ladder</h2>
          <LadderBoard
            clubSlug={club.slug}
            rungs={rungs}
            rules={ladderRules}
            meId={userId}
            isMember={isMember}
          />
          <LadderRules clubSlug={club.slug} rules={ladderRules} canEdit={organiser} />
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
                name={stripClubName(t.name, club.name)}
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
