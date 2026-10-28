import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChallengeActions } from "@/components/ChallengeActions";
import { PlayPanel } from "@/components/challenge/PlayPanel";
import { PlayerIdentity } from "@/components/ui/PlayerIdentity";
import { Avatar } from "@/components/ui/Avatar";
import { Icon, SPEED_ICON } from "@/components/ui/Icon";
import { displayRating } from "@/lib/services/ratings";
import { CATEGORY_ORDER, CATEGORY_LABEL, parseId, label, classify } from "@engine/game/timeControls";
import { sideToMove, readClocks } from "@/lib/game-clock";

export const metadata = { title: "Games" };

/** A live challenge goes stale rather than sitting there forever. */
const EXPIRY_MS = 15 * 60 * 1000;

function clockOf(tc: string) {
  const { base, increment } = parseId(tc);
  return { text: label(base, increment), category: classify(base, increment) };
}

function SectionHeader({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", marginBottom: "var(--s3)" }}>
      <h2
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
          textTransform: "uppercase", color: "var(--text-muted)",
        }}
      >
        {children}
      </h2>
      {count !== undefined && count > 0 && (
        <span
          className="digits"
          style={{
            fontSize: 11, fontWeight: 700, minWidth: 18, textAlign: "center",
            padding: "1px 6px", borderRadius: "var(--r-full)",
            background: "var(--gold)", color: "var(--gold-ink)",
          }}
        >
          {count}
        </span>
      )}
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

  const byCategory = Object.fromEntries(ratings.map((r) => [r.category, r]));
  const yourMove = activeGames.filter(
    (g) => sideToMove(g.fen) === (g.whiteId === userId ? "w" : "b"),
  ).length;

  return (
    <div style={{ paddingTop: "var(--s5)", display: "flex", flexDirection: "column", gap: "var(--s5)" }}>
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
            <span className="t-caption digits" style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              {onlineNow.length} online now
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
          <SectionHeader count={incoming.length}>Action required</SectionHeader>
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

      {/* Somebody else's game, which you may walk over and watch. */}
      {clubGames.length > 0 && (
        <section>
          <SectionHeader count={clubGames.length}>Being played now</SectionHeader>
          <div
            style={{
              display: "flex", gap: "var(--s3)", overflowX: "auto", paddingBottom: 2,
              marginLeft: "calc(-1 * var(--s4))", marginRight: "calc(-1 * var(--s4))",
              paddingLeft: "var(--s4)", paddingRight: "var(--s4)", scrollbarWidth: "none",
            }}
          >
            {clubGames.map((g) => {
              const seats = watching.get(g.id) ?? 0;
              const clock = clockOf(g.timeControl);
              return (
                <Link
                  key={g.id}
                  href={`/game/${g.id}`}
                  style={{
                    flex: "0 0 auto", width: 210, textDecoration: "none", color: "inherit",
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: "var(--r-lg)", padding: "var(--s3)",
                    display: "flex", flexDirection: "column", gap: "var(--s1)",
                  }}
                >
                  <p style={{ fontSize: "var(--t-secondary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.white.profile?.fullName ?? "White"} vs {g.black.profile?.fullName ?? "Black"}
                  </p>
                  <p className="t-caption digits" style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
                    <Icon name={SPEED_ICON[clock.category] ?? "timer"} size={12} />
                    {clock.text} · move {Math.ceil(g.sans.length / 2)}
                  </p>
                  <p className="t-caption digits" style={{ color: seats > 0 ? "var(--gold)" : "var(--text-dim)" }}>
                    {seats > 0 ? `${seats} watching` : "Be the first to watch"}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* The club board: games going spare, right now. */}
      {openSeeks.length > 0 && (
        <section>
          <SectionHeader count={openSeeks.length}>Open in your club</SectionHeader>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {openSeeks.map((c, i) => {
              const clock = clockOf(c.timeControl);
              const mins = c.expiresAt
                ? Math.max(0, Math.round((c.expiresAt.getTime() - Date.now()) / 60_000))
                : null;
              return (
                <div
                  key={c.id}
                  style={{
                    display: "flex", alignItems: "center", gap: "var(--s3)",
                    padding: "var(--s3) var(--s4)", minHeight: 68,
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <PlayerIdentity
                      name={c.from.profile?.fullName ?? "A player"}
                      handle={c.from.profile?.handle}
                      country={c.from.profile?.country}
                      title={c.from.profile?.title}
                      size="sm"
                      meta={
                        <>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <Icon name={SPEED_ICON[clock.category] ?? "timer"} size={13} />
                            <span className="digits">{clock.text}</span>
                          </span>
                          <span>{c.rated ? "rated" : "casual"}</span>
                          {(() => {
                            const theirs = seekRatingOf(c.fromId, clock.category);
                            const mineRow = byCategory[clock.category];
                            if (!theirs) return null;
                            const gap = mineRow ? theirs.rating - mineRow.rating : null;
                            return (
                              <span className="digits">
                                {Math.round(theirs.rating)}
                                {gap !== null && Math.abs(gap) >= 15 && (
                                  <span style={{ color: "var(--text-dim)" }}>
                                    {" "}{Math.abs(Math.round(gap))} {gap > 0 ? "above" : "below"} you
                                  </span>
                                )}
                              </span>
                            );
                          })()}
                          {mins !== null && <span className="digits">{mins}m left</span>}
                        </>
                      }
                    />
                  </div>
                  <ChallengeActions challengeId={c.id} seek />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* What you have sent out. Low emphasis — it is waiting on them. */}
      {outgoing.length > 0 && (
        <section>
          <SectionHeader>Sent</SectionHeader>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {outgoing.map((c, i) => {
              const clock = clockOf(c.timeControl);
              const left = c.expiresAt
                ? Math.max(0, Math.round((c.expiresAt.getTime() - Date.now()) / 60_000))
                : minutesLeft(c.createdAt);
              return (
                <div
                  key={c.id}
                  style={{
                    display: "flex", alignItems: "center", gap: "var(--s3)",
                    padding: "var(--s3) var(--s4)", minHeight: 64,
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <PlayerIdentity
                      name={c.to?.profile?.fullName ?? "Anyone in your club"}
                      country={c.to?.profile?.country}
                      title={c.to?.profile?.title}
                      size="sm"
                      meta={
                        <span className="digits">
                          {clock.text} · {c.rated ? "rated" : "casual"}
                          {left > 0 ? ` · expires in ${left} min` : " · expired"}
                        </span>
                      }
                    />
                  </div>
                  <ChallengeActions challengeId={c.id} mine />
                </div>
              );
            })}
          </div>
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

      {/* Rating is profile data, not a play control, so it sits last. */}
      <section>
        <SectionHeader>Your rating</SectionHeader>
        <div
          className="card"
          style={{ padding: "var(--s2) var(--s1)", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderRadius: "var(--r-md)" }}
        >
          {CATEGORY_ORDER.map((c, i) => {
            const row = byCategory[c];
            return (
              <div
                key={c}
                style={{
                  textAlign: "center", padding: "var(--s1) var(--s2)",
                  borderLeft: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <p className="digits" style={{ fontSize: 17, fontWeight: 600, color: row ? "var(--text)" : "var(--text-dim)" }}>
                  {displayRating(row)}
                </p>
                <p style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                  {CATEGORY_LABEL[c]}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
