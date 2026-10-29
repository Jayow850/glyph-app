import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { FollowButton } from "@/components/FollowButton";
import { MessageButton } from "@/components/messages/MessageButton";
import { Avatar } from "@/components/ui/Avatar";
import { Flag } from "@/components/ui/Flag";
import { Icon } from "@/components/ui/Icon";
import { Sparkline } from "@/components/ui/Sparkline";
import { ListRow, ListGroup } from "@/components/ui/ListRow";
import { streaksFor, recentForm } from "@/lib/services/streak";
import { trophiesFor } from "@/lib/services/trophies";
import { TrophyShelf } from "@/components/trophy/TrophyShelf";
import { CATEGORY_ORDER, CATEGORY_LABEL, parseId, label } from "@engine/game/timeControls";

const PIP = { W: "var(--success)", L: "var(--danger)", D: "var(--draw)" } as const;

function ago(at: Date) {
  const mins = Math.floor((Date.now() - at.getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
}

const REASON: Record<string, string> = {
  checkmate: "checkmate",
  resign: "resignation",
  timeout: "time",
  timeout_vs_insufficient: "time, insufficient material",
  draw_agreed: "agreement",
  stalemate: "stalemate",
  fifty: "fifty-move rule",
  threefold: "repetition",
  material: "insufficient material",
  abandoned: "abandonment",
};

/**
 * A profile.
 *
 * It was a name, three counts and a row of four rating numbers — while
 * the database held a full rating history, every game ever played and
 * a termination reason on each one. The data was all there. Nothing
 * read it.
 */
export async function ProfileView({
  userId,
  isMe,
  viewerId = null,
}: {
  userId: string;
  isMe: boolean;
  viewerId?: string | null;
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      glyphRatings: { include: { history: { orderBy: { createdAt: "asc" }, take: 40 } } },
      posts: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!user) return <p style={{ paddingTop: "var(--s8)" }}>Profile not found.</p>;

  const [followers, following, postCount, viewerFollows, games, streaks, form] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
    prisma.post.count({ where: { authorId: userId } }),
    viewerId && viewerId !== userId
      ? prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: viewerId, followingId: userId } },
        })
      : Promise.resolve(null),
    prisma.liveGame.findMany({
      where: { status: { not: "ACTIVE" }, OR: [{ whiteId: userId }, { blackId: userId }] },
      include: { white: { include: { profile: true } }, black: { include: { profile: true } } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    streaksFor([userId]),
    recentForm(userId, 5),
  ]);

  const honours = await trophiesFor(userId);

  // Rivalry is the emotional core of club chess, and the first thing
  // anyone wants to know when they open someone else's profile.
  const h2h =
    viewerId && viewerId !== userId
      ? await prisma.liveGame.findMany({
          where: {
            status: { not: "ACTIVE" },
            result: { not: null },
            NOT: { endReason: "aborted" },
            OR: [
              { whiteId: viewerId, blackId: userId },
              { whiteId: userId, blackId: viewerId },
            ],
          },
          select: { whiteId: true, result: true },
        })
      : [];

  const record = h2h.reduce(
    (acc, g) => {
      if (g.result === "1/2-1/2") acc.d++;
      else if ((g.whiteId === viewerId) === (g.result === "1-0")) acc.w++;
      else acc.l++;
      return acc;
    },
    { w: 0, l: 0, d: 0 },
  );

  const name = user.profile?.fullName ?? "Player";
  const handle = user.profile?.handle ?? "";
  const hasTitle = Boolean(user.profile?.title) && user.profile?.title !== "NONE";
  const byCategory = Object.fromEntries(user.glyphRatings.map((r) => [r.category, r]));
  const streak = streaks.get(userId);

  return (
    <div
      className="page-bottom"
      style={{ paddingTop: "var(--s5)", display: "flex", flexDirection: "column", gap: "var(--s6)" }}
    >
      <section style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s4)" }}>
          <Avatar name={name} size={64} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              {hasTitle && (
                <span
                  style={{
                    fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                    background: "var(--gold)", color: "var(--gold-ink)", flexShrink: 0,
                  }}
                >
                  {user.profile?.title}
                </span>
              )}
              <h1
                className="font-display t-h1"
                style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {name}
              </h1>
              {user.profile?.country && <Flag code={user.profile.country} height={14} />}
            </div>
            <p className="t-rowmeta">@{handle}</p>
          </div>

          {!isMe && viewerId && handle && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", flexShrink: 0 }}>
              <MessageButton handle={handle} name={name} />
              <FollowButton handle={handle} initialFollowing={Boolean(viewerFollows)} />
            </div>
          )}
        </div>

        {user.profile?.bio && <p className="t-body">{user.profile.bio}</p>}

        <div style={{ display: "flex", gap: "var(--s6)" }}>
          <span className="t-secondary">
            <b className="digits" style={{ color: "var(--text)" }}>{postCount}</b> Posts
          </span>
          <span className="t-secondary">
            <b className="digits" style={{ color: "var(--text)" }}>{following}</b> Following
          </span>
          <span className="t-secondary">
            <b className="digits" style={{ color: "var(--text)" }}>{followers}</b> Followers
          </span>
        </div>

        {(form.length > 0 || (streak?.days ?? 0) > 0) && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)", flexWrap: "wrap" }}>
            {(streak?.days ?? 0) > 0 && (
              <span
                className="t-caption"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "4px 10px", borderRadius: "var(--r-full)",
                  background: "var(--gold-wash)", color: "var(--gold)", fontWeight: 600,
                }}
              >
                <Icon name="bolt" size={13} />
                <span className="digits">{streak?.days}</span> day streak
              </span>
            )}
            {form.length > 0 && (
              <span style={{ display: "flex", gap: 4 }}>
                {form.map((r, i) => (
                  <span
                    key={i}
                    title={r === "W" ? "Win" : r === "L" ? "Loss" : "Draw"}
                    style={{
                      width: 18, height: 18, borderRadius: "50%",
                      display: "grid", placeItems: "center",
                      fontSize: 9, fontWeight: 700,
                      background: PIP[r], color: "var(--bg)",
                    }}
                  >
                    {r}
                  </span>
                ))}
              </span>
            )}
          </div>
        )}

        {!isMe && h2h.length > 0 && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: "var(--s3)",
              padding: "var(--s3) var(--s4)", borderRadius: "var(--r-md)",
              background: "var(--surface)", border: "1px solid var(--border)",
            }}
          >
            <Icon name="swords" size={17} />
            <span className="t-secondary" style={{ flex: 1, color: "var(--text)" }}>Against you</span>
            <span className="digits" style={{ fontWeight: 700 }}>
              <span style={{ color: "var(--success)" }}>{record.w}</span>
              <span style={{ color: "var(--text-dim)" }}>–</span>
              <span style={{ color: "var(--danger)" }}>{record.l}</span>
              <span style={{ color: "var(--text-dim)" }}>–</span>
              <span style={{ color: "var(--draw)" }}>{record.d}</span>
            </span>
          </div>
        )}

        {!isMe && (
          <Link
            href="/challenges"
            className="press"
            style={{
              display: "block", textAlign: "center", textDecoration: "none",
              background: "var(--gold)", color: "var(--gold-ink)",
              borderRadius: "var(--r-md)", padding: "13px 0",
              fontSize: "var(--t-body)", fontWeight: 600,
            }}
          >
            Challenge {name.split(" ")[0]}
          </Link>
        )}
      </section>

      {/* Silverware outranks every number below it. */}
      <TrophyShelf trophies={honours} />

      {/* Rating, with the shape of how it got there. Every rated game
          has written a history row since the Glicko-2 work; this is
          the first thing to read them. */}
      <section>
        <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>GLYPH rating</h2>
        <ListGroup>
          {CATEGORY_ORDER.map((c) => {
            const row = byCategory[c];
            const history = row?.history ?? [];
            const points = history.map((h) => h.after);
            const week = history.filter((h) => h.createdAt.getTime() > Date.now() - 7 * 86_400_000);
            const net = week.reduce((s, h) => s + h.delta, 0);

            return (
              <div
                key={c}
                style={{
                  display: "flex", alignItems: "center", gap: "var(--s3)",
                  padding: "var(--s3) var(--s4)", minHeight: 58,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="t-row">
                    <span className="digits">{row ? Math.round(row.rating) : "—"}</span>
                    {row && row.rd > 110 && <span style={{ color: "var(--text-dim)" }}>?</span>}
                  </p>
                  <p className="t-rowmeta">
                    {CATEGORY_LABEL[c]}
                    {row && row.games > 0 && <> · <span className="digits">{row.games}</span> games</>}
                  </p>
                </div>

                {net !== 0 && (
                  <span
                    className="digits"
                    style={{ fontSize: 13, fontWeight: 700, color: net > 0 ? "var(--success)" : "var(--danger)" }}
                  >
                    {net > 0 ? "+" : ""}{net}
                  </span>
                )}

                <Sparkline points={points} />
              </div>
            );
          })}
        </ListGroup>
      </section>

      {games.length > 0 && (
        <section>
          <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>Recent games</h2>
          <ListGroup>
            {games.map((g) => {
              const youWereWhite = g.whiteId === userId;
              const opponent = youWereWhite ? g.black : g.white;
              const drew = g.result === "1/2-1/2";
              const won = !drew && youWereWhite === (g.result === "1-0");
              const outcome: "W" | "L" | "D" = drew ? "D" : won ? "W" : "L";
              const { base, increment } = parseId(g.timeControl);
              const delta = youWereWhite ? g.whiteRatingDelta : g.blackRatingDelta;

              return (
                <ListRow
                  key={g.id}
                  size="sm"
                  href={`/game/${g.id}`}
                  name={opponent.profile?.fullName ?? "A player"}
                  country={opponent.profile?.country}
                  title={opponent.profile?.title}
                  icon={
                    <span
                      aria-hidden="true"
                      style={{
                        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                        display: "grid", placeItems: "center",
                        fontSize: 12, fontWeight: 700,
                        background: PIP[outcome], color: "var(--bg)",
                      }}
                    >
                      {outcome}
                    </span>
                  }
                  meta={[
                    <span key="tc" className="digits">{label(base, increment)}</span>,
                    youWereWhite ? "as White" : "as Black",
                    g.endReason ? REASON[g.endReason] ?? g.endReason : null,
                    ago(g.updatedAt),
                  ]}
                  action={
                    delta !== null && delta !== undefined ? (
                      <span
                        className="digits"
                        style={{
                          fontSize: 13, fontWeight: 700,
                          color: delta > 0 ? "var(--success)" : delta < 0 ? "var(--danger)" : "var(--text-muted)",
                        }}
                      >
                        {delta > 0 ? "+" : ""}{delta}
                      </span>
                    ) : null
                  }
                />
              );
            })}
          </ListGroup>
        </section>
      )}

      <section>
        <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>Posts</h2>
        {user.posts.length === 0 ? (
          <div
            style={{
              textAlign: "center", padding: "var(--s8) var(--s4)",
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--r-lg)",
            }}
          >
            <span style={{ color: "var(--text-dim)", display: "inline-block", marginBottom: "var(--s2)" }}>
              <Icon name="list" size={26} />
            </span>
            <p className="t-secondary">{isMe ? "Nothing published yet." : "No posts yet."}</p>
            {isMe && (
              <Link
                href="/compose"
                className="press"
                style={{
                  display: "inline-block", marginTop: "var(--s3)",
                  borderRadius: "var(--r-md)", padding: "var(--s2) var(--s4)",
                  fontSize: "var(--t-secondary)", fontWeight: 600, textDecoration: "none",
                  background: "var(--gold)", color: "var(--gold-ink)",
                }}
              >
                Make your first move
              </Link>
            )}
          </div>
        ) : (
          <ListGroup>
            {user.posts.map((p) => (
              <ListRow
                key={p.id}
                size="sm"
                href={`/post/${p.id}`}
                avatar={false}
                name={p.body?.slice(0, 80) || p.type}
                meta={[p.type !== "TEXT" ? p.type.toLowerCase() : null, ago(p.createdAt)]}
              />
            ))}
          </ListGroup>
        )}
      </section>
    </div>
  );
}
