import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { FollowButton } from "@/components/FollowButton";
import { displayRating } from "@/lib/services/ratings";
import { CATEGORY_ORDER, CATEGORY_LABEL, CATEGORY_ICON } from "@engine/game/timeControls";

const AVATAR_TINTS = ["#5E7A63", "#9A6A43", "#58627A", "#7A5E6E", "#4A6B78", "#6E6A45"];
function tintFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

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
      glyphRatings: true,
      posts: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!user) return <p style={{ paddingTop: 32 }}>Profile not found.</p>;

  const [followers, following, postCount, viewerFollows] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
    prisma.post.count({ where: { authorId: userId } }),
    viewerId && viewerId !== userId
      ? prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: viewerId, followingId: userId } },
        })
      : Promise.resolve(null),
  ]);

  const name = user.profile?.fullName ?? "Player";
  const handle = user.profile?.handle ?? "";
  const byCategory = Object.fromEntries(user.glyphRatings.map((r) => [r.category, r]));

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            aria-hidden="true"
            style={{
              width: 72, height: 72, borderRadius: 20, display: "grid", placeItems: "center",
              background: tintFor(name), color: "#F5F1E8", fontSize: 26, fontWeight: 600, flexShrink: 0,
            }}
          >
            {initials(name)}
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-display" style={{ fontSize: 24 }}>
              {user.profile?.title && user.profile.title !== "NONE" && (
                <span className="text-gold" style={{ marginRight: 6 }}>{user.profile.title}</span>
              )}
              {name}
            </p>
            <p className="text-ivory-meta" style={{ fontSize: 14 }}>@{handle}</p>
          </div>

          {!isMe && viewerId && handle && (
            <FollowButton handle={handle} initialFollowing={Boolean(viewerFollows)} />
          )}
        </div>

        {user.profile?.bio && <p style={{ fontSize: 15, lineHeight: 1.55 }}>{user.profile.bio}</p>}

        <div style={{ display: "flex", gap: 24 }}>
          <span style={{ fontSize: 14 }}><b className="digits">{postCount}</b> <span className="text-ivory-meta">Posts</span></span>
          <span style={{ fontSize: 14 }}><b className="digits">{following}</b> <span className="text-ivory-meta">Following</span></span>
          <span style={{ fontSize: 14 }}><b className="digits">{followers}</b> <span className="text-ivory-meta">Followers</span></span>
        </div>

        {!isMe && (
          <Link
            href="/challenges"
            style={{
              display: "block", textAlign: "center", textDecoration: "none",
              background: "#1C1C21", border: "1px solid rgba(212,175,55,0.22)",
              color: "#D4AF37", borderRadius: 12, padding: "11px 0",
              fontSize: 15, fontWeight: 600,
            }}
          >
            Challenge {name.split(" ")[0]}
          </Link>
        )}
      </div>

      <section className="card" style={{ padding: 0, overflow: "hidden" }}>
        <p className="section-label" style={{ padding: "16px 20px 10px" }}>GLYPH rating</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {CATEGORY_ORDER.map((c, i) => {
            const row = byCategory[c];
            return (
              <div
                key={c}
                style={{
                  padding: "4px 8px 18px", textAlign: "center",
                  borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <p style={{ fontSize: 14, color: "#8A8A93", lineHeight: 1.2 }}>{CATEGORY_ICON[c]}</p>
                <p className="digits" style={{ fontSize: 21, fontWeight: 600, color: row ? "#F5F1E8" : "#53535C" }}>
                  {displayRating(row)}
                </p>
                <p className="section-label">{CATEGORY_LABEL[c]}</p>
                {row && row.games > 0 && (
                  <p className="digits" style={{ fontSize: 11, color: "#53535C" }}>{row.games} games</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="card">
        <p className="section-label" style={{ marginBottom: 12 }}>Posts</p>
        {user.posts.length === 0 ? (
          <p className="text-ivory-meta" style={{ fontSize: 14 }}>
            {isMe ? <>Nothing published yet. <Link href="/compose" className="text-gold">Make your first move →</Link></> : "No posts yet."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {user.posts.map((p) => (
              <div key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 12 }}>
                <p style={{ fontSize: 15, lineHeight: 1.5 }}>{p.body ?? `[${p.type}]`}</p>
                <p className="text-ivory-meta digits" style={{ fontSize: 12, marginTop: 4 }}>
                  {new Date(p.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
