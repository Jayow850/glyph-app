import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChallengeActions } from "@/components/ChallengeActions";
import { PlayPanel } from "@/components/challenge/PlayPanel";
import { PlayerIdentity } from "@/components/ui/PlayerIdentity";
import { Avatar } from "@/components/ui/Avatar";
import { ListRow, ListGroup } from "@/components/ui/ListRow";
import { FormCard } from "@/components/club/FormCard";
import { streaksFor, recentForm } from "@/lib/services/streak";
import { Icon, SPEED_ICON } from "@/components/ui/Icon";
import { CATEGORY_ORDER, CATEGORY_LABEL, parseId, label, classify } from "@engine/game/timeControls";
import { sideToMove, readClocks } from "@/lib/game-clock";
import { ClubNightCard } from "@/components/club/ClubNightCard";
import { clubNightFor } from "@/lib/services/clubnight";

export const metadata = { title: "Games" };

/** A live challenge goes stale rather than sitting there forever. */
const EXPIRY_MS = 15 * 60 * 1000;

function clockOf(tc: string) {
  const { base, increment } = parseId(tc);
  return { text: label(base, increment), category: classify(base, increment) };
}

function SectionHeader({
  children,
  count,
  urgent = false,
  info,
}: {
  children: React.ReactNode;
  count?: number;
  /** Gold is for something that wants an answer, not for counting. */
  urgent?: boolean;
  /** Help belongs in the header, not as a row of its own. */
  info?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", marginBottom: "var(--s3)" }}>
      <h2 className="section-label">{children}</h2>
      {count !== undefined && count > 0 && (
        <span
          className="digits"
          style={{
            fontSize: 11, fontWeight: 700, minWidth: 18, textAlign: "center",
            padding: "1px 6px", borderRadius: "var(--r-full)",
            background: urgent ? "var(--gold)" : "var(--surface-2)",
            color: urgent ? "var(--gold-ink)" : "var(--text-muted)",
          }}
        >
          {count}
        </span>
      )}
      {info && <span style={{ marginLeft: "auto" }}>{info}</span>}
    </div>
  );
}

function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "gold" }) {
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 600, letterSpacing: "0.03em",
        padding: "2px 7px", borderRadius: "var(--r-full)",
        background: tone === "gold" ? "var(--gold-wash)" : "var(--surface-2)",
        color: tone === "gold" ? "var(--gold)" : "var(--text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function minutesLeft(createdAt: Date) {
  return Math.max(0, Math.round((createdAt.getTime() + EXPIRY_MS - Date.now()) / 60000));
}

export default async function ChallengesPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;

  if (!userId) {
    return (
      <div style={{ paddingTop: "var(--s12)", textAlign: "center" }}>
        <p className="font-display t-h1">Sign in to play.</p>
        <Link
          href="/api/auth/signin"
          className="press"
          style={{
            display: "inline-block", marginTop: "var(--s4)", borderRadius: "var(--r-md)",
            padding: "var(--s3) var(--s5)", fontWeight: 600,
            background: "var(--gold)", color: "var(--gold-ink)",
          }}
        >
          Sign in
        </Link>
      </div>
    );
  }

  const [incoming, outgoing, activeGames, ratings, memberships] = await Promise.all([
    prisma.challenge.findMany({
      where: { toId: userId, status: "pending" },
      include: { from: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.challenge.findMany({
      where: { fromId: userId, status: "pending" },
      include: { to: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.liveGame.findMany({
      where: { status: "ACTIVE", OR: [{ whiteId: userId }, { blackId: userId }] },
      include: { white: { include: { profile: true } }, black: { include: { profile: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.glyphRating.findMany({ where: { userId } }),
    prisma.membership.findMany({ where: { userId, active: true }, select: { clubId: true } }),
  ]);

  // The club board. Challenge.clubId is a plain column rather than a
  // relation, so the club names come back in a second, tiny query.
  // `in: []` simply matches nothing, so there is no empty-list branch to
  // keep in step — and no union of array types for the renderer to trip on.
  // Declared here because the form block below reads it inside a
  // CATEGORY_ORDER.map that runs immediately — a const referenced from
  // a callback passes type-checking and then throws at runtime if the
  // callback is not actually deferred.
  const byCategory = Object.fromEntries(ratings.map((r) => [r.category, r]));

  const clubIds = memberships.map((m) => m.clubId);
  const [openSeeks, clubs] = await Promise.all([
    prisma.challenge.findMany({
      where: {
        toId: null,
        status: "pending",
        clubId: { in: clubIds },
        fromId: { not: userId },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { from: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.club.findMany({ where: { id: { in: clubIds } }, select: { id: true, name: true } }),
  ]);
  const clubName = new Map(clubs.map((c) => [c.id, c.name]));

  // Games you are not in, being played by people you share a club with.
  // A club where you can only play your own games is a matchmaker, not
  // a club — this is the door to someone else's board.
  const memberIds = clubIds.length
    ? (await prisma.membership.findMany({
        where: { clubId: { in: clubIds }, active: true },
        select: { userId: true },
      })).map((m) => m.userId)
    : [];

  const [clubGames, watchCounts] = await Promise.all([
    prisma.liveGame.findMany({
      where: {
        status: "ACTIVE",
        whiteId: { in: memberIds },
        blackId: { in: memberIds },
        NOT: { OR: [{ whiteId: userId }, { blackId: userId }] },
      },
      include: { white: { include: { profile: true } }, black: { include: { profile: true } } },
      orderBy: { lastMoveAt: "desc" },
      take: 8,
    }),
    prisma.spectator.groupBy({
      by: ["liveGameId"],
      where: { lastSeenAt: { gte: new Date(Date.now() - 25_000) } },
      _count: { _all: true },
    }),
  ]);
  const watching = new Map(watchCounts.map((w) => [w.liveGameId, w._count._all]));

  // Presence, and how close each open seek is to your own strength.
  // "1540, 60 below you" is a decision; a bare number is homework.
  const [onlineNow, seekRatings] = await Promise.all([
    prisma.profile.findMany({
      where: {
        userId: { in: memberIds.filter((id) => id !== userId) },
        lastSeenAt: { gte: new Date(Date.now() - 3 * 60 * 1000) },
      },
      select: { userId: true, fullName: true, handle: true, country: true },
      take: 14,
    }),
    prisma.glyphRating.findMany({
      where: { userId: { in: openSeeks.map((c) => c.fromId) } },
    }),
  ]);

  const seekRatingOf = (uid: string, category: string) =>
    seekRatings.find((r) => r.userId === uid && r.category === category) ?? null;

  // Form: the streak read from the games themselves, this player's last
  // results, and — the part only a club can do — who else is on a run.
  const [streaks, form] = await Promise.all([
    streaksFor(memberIds.length ? memberIds : [userId]),
    recentForm(userId),
  ]);

  const mine = streaks.get(userId) ?? { days: 0, today: 0, recoverable: false, best: 0 };
  const companions = [...streaks.entries()].filter(
    ([id, st]) => id !== userId && st.days >= Math.max(1, mine.days),
  ).length;

  // Somebody whose run lapses tonight. One lapse turned into a game is
  // the most useful thing this card can do.
  const lapsing = [...streaks.entries()].find(
    ([id, st]) => id !== userId && st.days > 0 && st.today === 0,
  );
  const lapsingProfile = lapsing
    ? await prisma.profile.findUnique({
        where: { userId: lapsing[0] },
        select: { fullName: true, handle: true },
      })
    : null;

  // The nearest round hundred that is actually in reach.
  const milestone = CATEGORY_ORDER.map((c) => {
    const row = byCategory[c];
    if (!row) return null;
    const target = (Math.floor(row.rating / 100) + 1) * 100;
    return { category: CATEGORY_LABEL[c], points: Math.round(target - row.rating), target };
  })
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => a.points - b.points)[0] ?? null;

  const yourMove = activeGames.filter(
    (g) => sideToMove(g.fen) === (g.whiteId === userId ? "w" : "b"),
  ).length;

  // Club nights, but only the ones close enough to act on. This page is
  // about tonight; a night eight days out belongs on the club page.
  const nights = (await Promise.all(clubIds.map((id) => clubNightFor(id, userId))))
    .filter((n): n is NonNullable<typeof n> => n !== null && (n.imminent || n.state === "LIVE"))
    .sort((a, b) => a.msUntil - b.msUntil);

  return (
    <div className="page-bottom"
      style={{ paddingTop: "var(--s5)", display: "flex", flexDirection: "column", gap: "var(--s6)" }}>
      <h1 className="font-display t-display">Games</h1>

      {/* Who is around. Club apps are returned to for people, not for
          features, so presence goes above everything else. */}
      {onlineNow.length > 0 && (
        <section style={{ marginTop: "calc(-1 * var(--s3))" }}>
          <div
            style={{
              display: "flex", alignItems: "center", gap: "var(--s3)",
              padding: "var(--s2) var(--s3)",
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--r-full)",
            }}
          >
            <span style={{ display: "flex", flexShrink: 0 }}>
              {onlineNow.slice(0, 6).map((m, i) => (
                <Link
                  key={m.userId}
                  href={`/profile/${m.handle}`}
                  title={m.fullName ?? m.handle}
                  style={{ marginLeft: i === 0 ? 0 : -9, display: "block" }}
                >
                  <Avatar name={m.fullName ?? m.handle ?? "Member"} size={26} />
                </Link>
              ))}
            </span>
            <span className="t-caption" style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              <span className="digits">{onlineNow.length}</span> here now
              {clubGames.length > 0 && (
                <> · <span className="digits">{clubGames.length}</span> game{clubGames.length === 1 ? "" : "s"} live</>
              )}
            </span>
            <span style={{ flex: 1 }} />
            <span
              aria-hidden="true"
              style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)", flexShrink: 0 }}
            />
          </div>
        </section>
      )}

      {/* Anything waiting on you comes before anything you might start. */}
      {incoming.length > 0 && (
        <section>
          <SectionHeader count={incoming.length} urgent>Waiting on you</SectionHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
            {incoming.map((c) => {
              const clock = clockOf(c.timeControl);
              return (
                <div
                  key={c.id}
                  className="card"
                  style={{
                    padding: "var(--s4)", borderColor: "var(--gold-wash)",
                    display: "flex", flexDirection: "column", gap: "var(--s3)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <PlayerIdentity
                        name={c.from.profile?.fullName ?? "A player"}
                        handle={c.from.profile?.handle}
                        country={c.from.profile?.country}
                        title={c.from.profile?.title}
                        size="md"
                        meta={
                          <>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Icon name={SPEED_ICON[clock.category] ?? "timer"} size={13} />
                              <span className="digits">{clock.text}</span>
                            </span>
                            <Badge tone={c.rated ? "gold" : "muted"}>{c.rated ? "Rated" : "Casual"}</Badge>
                          </>
                        }
                      />
                    </div>
                  </div>

                  {c.message && (
                    <p className="t-secondary" style={{ fontStyle: "italic", color: "var(--text)" }}>
                      “{c.message}”
                    </p>
                  )}

                  <ChallengeActions challengeId={c.id} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Tonight, if there is a tonight. Above Play because turning up to
          the club beats finding a stranger. */}
      {nights.length > 0 && (
        <section>
          <SectionHeader urgent={nights.some((n) => n.state === "LIVE")}>Club night</SectionHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
            {nights.map((n) => (
              <ClubNightCard
                key={n.id}
                id={n.id}
                clubSlug={n.clubSlug}
                clubName={n.clubName}
                showClub
                startsAt={n.startsAt.toISOString()}
                timeControl={n.timeControl}
                rounds={n.rounds}
                state={n.state}
                tournamentId={n.tournamentId}
                going={n.going}
                maybe={n.maybe}
                yourState={n.yourState}
                startable={n.startable}
                canStart={false}
              />
            ))}
          </div>
        </section>
      )}

      {/* The primary action, always reachable without scrolling. */}
      <section>
        <SectionHeader>Play</SectionHeader>
        <PlayPanel />
      </section>

      {/* Your own boards, your move first. */}
      {activeGames.length > 0 && (
        <section>
          <SectionHeader count={yourMove}>Your games</SectionHeader>
          <div
            style={{
              display: "flex", gap: "var(--s3)", overflowX: "auto",
              marginLeft: "calc(-1 * var(--s4))", marginRight: "calc(-1 * var(--s4))",
              paddingLeft: "var(--s4)", paddingRight: "var(--s4)", paddingBottom: 4,
              scrollbarWidth: "none",
            }}
          >
            {activeGames.map((g) => {
              const mine = g.whiteId === userId ? "w" : "b";
              const opp = mine === "w" ? g.black : g.white;
              const turn = sideToMove(g.fen) === mine;
              const clocks = readClocks(g);
              const left = mine === "w" ? clocks.whiteMs : clocks.blackMs;
              const mins = Math.floor(left / 60000);
              const secs = Math.floor((left % 60000) / 1000);

              return (
                <Link
                  key={g.id}
                  href={`/game/${g.id}`}
                  className="press"
                  style={{
                    flex: "0 0 auto", width: 190, textDecoration: "none", color: "inherit",
                    background: "var(--surface)",
                    border: `1px solid ${turn ? "var(--gold)" : "var(--border)"}`,
                    borderRadius: "var(--r-lg)", padding: "var(--s3)",
                    display: "flex", flexDirection: "column", gap: "var(--s2)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
                    <PlayerIdentity
                      name={opp.profile?.fullName ?? "Player"}
                      country={opp.profile?.country}
                      title={opp.profile?.title}
                      size="sm"
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <span
                      style={{
                        fontSize: "var(--t-caption)", fontWeight: 700,
                        color: turn ? "var(--gold)" : "var(--text-muted)",
                      }}
                    >
                      {turn ? "Your move" : "Waiting"}
                    </span>
                    <span className="digits t-caption" style={{ color: "var(--text-muted)" }}>
                      {mins}:{secs.toString().padStart(2, "0")}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Somebody else's game, which you may walk over and watch.
          Chess.com buries spectating and Lichess shows a number; for a
          club, watching your clubmates play is the social act itself. */}
      {clubGames.length > 0 && (
        <section>
          <SectionHeader count={clubGames.length}>Live in your club</SectionHeader>
          <ListGroup>
            {clubGames.map((g) => {
              const seats = watching.get(g.id) ?? 0;
              const clock = clockOf(g.timeControl);
              const clocks = readClocks(g);
              const turn = sideToMove(g.fen);
              const ms = turn === "w" ? clocks.whiteMs : clocks.blackMs;
              const mm = Math.floor(ms / 60000);
              const ss = Math.floor((ms % 60000) / 1000);

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
                    <span key="c" className="digits">{mm}:{String(ss).padStart(2, "0")}</span>,
                    <span key="tc" className="digits">{clock.text}</span>,
                    `move ${Math.ceil(g.sans.length / 2)}`,
                    seats > 0 ? `${seats} watching` : null,
                  ]}
                  action={
                    <span className="t-caption" style={{ color: "var(--gold)", fontWeight: 600 }}>
                      Watch
                    </span>
                  }
                />
              );
            })}
          </ListGroup>
        </section>
      )}

      {/* The club board: games going spare, right now. */}
      {openSeeks.length > 0 && (
        <section>
          <SectionHeader count={openSeeks.length}>Open in your club</SectionHeader>
          <ListGroup>
            {openSeeks.map((c) => {
              const clock = clockOf(c.timeControl);
              const mins = c.expiresAt
                ? Math.max(0, Math.round((c.expiresAt.getTime() - Date.now()) / 60_000))
                : null;
              const theirs = seekRatingOf(c.fromId, clock.category);
              const mineRow = byCategory[clock.category];
              const gap = theirs && mineRow ? Math.round(theirs.rating - mineRow.rating) : null;

              return (
                <ListRow
                  key={c.id}
                  name={c.from.profile?.fullName ?? "A player"}
                  country={c.from.profile?.country}
                  title={c.from.profile?.title}
                  rating={theirs ? String(Math.round(theirs.rating)) : undefined}
                  meta={[
                    <span key="tc" style={{ display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "-2px" }}>
                      <Icon name={SPEED_ICON[clock.category] ?? "timer"} size={12} />
                      <span className="digits">{clock.text}</span>
                    </span>,
                    c.rated ? "rated" : "casual",
                    gap !== null && Math.abs(gap) >= 15
                      ? `${Math.abs(gap)} ${gap > 0 ? "above" : "below"} you`
                      : null,
                    mins !== null ? `${mins}m left` : null,
                  ]}
                  action={<ChallengeActions challengeId={c.id} seek />}
                />
              );
            })}
          </ListGroup>
        </section>
      )}

      {/* What you have sent out. Low emphasis — it is waiting on them. */}
      {outgoing.length > 0 && (
        <section>
          <SectionHeader>Sent</SectionHeader>
          <ListGroup>
            {outgoing.map((c) => {
              const clock = clockOf(c.timeControl);
              const left = c.expiresAt
                ? Math.max(0, Math.round((c.expiresAt.getTime() - Date.now()) / 60_000))
                : minutesLeft(c.createdAt);
              const openSeek = !c.to;
              return (
                <ListRow
                  key={c.id}
                  size="sm"
                  name={c.to?.profile?.fullName ?? "Anyone in your club"}
                  country={c.to?.profile?.country}
                  title={c.to?.profile?.title}
                  icon={
                    openSeek ? (
                      // An open seek is not a person, so it does not get
                      // a person's initials. It was rendering as "AI".
                      <span
                        aria-hidden="true"
                        style={{
                          width: 34, height: 34, borderRadius: "var(--r-md)", flexShrink: 0,
                          display: "grid", placeItems: "center",
                          background: "var(--surface-2)", color: "var(--text-muted)",
                          border: "1px dashed var(--border)",
                        }}
                      >
                        <Icon name="inbox" size={17} />
                      </span>
                    ) : undefined
                  }
                  meta={[
                    <span key="tc" className="digits">{clock.text}</span>,
                    c.rated ? "rated" : "casual",
                    left > 0 ? `expires in ${left} min` : "expired",
                  ]}
                  action={<ChallengeActions challengeId={c.id} mine />}
                />
              );
            })}
          </ListGroup>
        </section>
      )}

      {/* Nothing at all going on: say so, and give one way out. */}
      {incoming.length === 0 && activeGames.length === 0 && clubGames.length === 0 && openSeeks.length === 0 && (
        <section
          style={{
            textAlign: "center", padding: "var(--s8) var(--s4)",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
          }}
        >
          <span style={{ color: "var(--text-dim)", display: "inline-block", marginBottom: "var(--s2)" }}>
            <Icon name="castle" size={30} />
          </span>
          <p style={{ fontWeight: 600 }}>The club is quiet.</p>
          <p className="t-secondary" style={{ marginTop: 2 }}>
            Post a seek and someone will take it.
          </p>
        </section>
      )}

      {/* Your form. Rating is part of it, not the whole of it. */}
      <section>
        <SectionHeader>Your form</SectionHeader>
        <FormCard
          streak={mine}
          companions={companions}
          nudge={
            lapsing && lapsingProfile?.handle
              ? {
                  name: lapsingProfile.fullName ?? lapsingProfile.handle,
                  handle: lapsingProfile.handle,
                  days: lapsing[1].days,
                }
              : null
          }
          form={form}
          ratings={Object.fromEntries(
            CATEGORY_ORDER.map((c) => [
              c,
              byCategory[c] && {
                rating: byCategory[c]!.rating,
                rd: byCategory[c]!.rd,
                games: byCategory[c]!.games,
              },
            ]),
          )}
          milestone={milestone}
        />
      </section>

    </div>
  );
}
