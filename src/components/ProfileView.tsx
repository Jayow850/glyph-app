import Link from "next/link";
import { prisma } from "@/lib/prisma";

export async function ProfileView({ userId, isMe }: { userId: string; isMe: boolean }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      ratings: { where: { clubId: null } },
      posts: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!user) return <p style={{ paddingTop: 32 }}>Profile not found.</p>;

  const [followers, following, postCount] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
    prisma.post.count({ where: { authorId: userId } }),
  ]);

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", display: "grid", placeItems: "center",
            background: "#1C1C21", border: "1px solid rgba(212,175,55,0.15)", fontSize: 32, flexShrink: 0 }}>♟</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-display" style={{ fontSize: 24 }}>
              {user.profile?.title && user.profile.title !== "NONE" && (
                <span className="text-gold" style={{ marginRight: 6 }}>{user.profile.title}</span>
              )}
              {user.profile?.fullName ?? "Player"}
            </p>
            <p className="text-ivory-meta" style={{ fontSize: 14 }}>@{user.profile?.handle}</p>
          </div>
        </div>
        {user.profile?.bio && <p style={{ fontSize: 15, lineHeight: 1.55 }}>{user.profile.bio}</p>}
        <div style={{ display: "flex", gap: 24 }}>
          <span style={{ fontSize: 14 }}><b className="digits">{postCount}</b> <span className="text-ivory-meta">Posts</span></span>
          <span style={{ fontSize: 14 }}><b className="digits">{following}</b> <span className="text-ivory-meta">Following</span></span>
          <span style={{ fontSize: 14 }}><b className="digits">{followers}</b> <span className="text-ivory-meta">Followers</span></span>
        </div>
      </div>

      <div className="card">
        <p className="section-label" style={{ marginBottom: 12 }}>Ratings</p>
        {user.ratings.length === 0 ? (
          <p className="text-ivory-meta" style={{ fontSize: 14 }}>No rated games yet.</p>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {user.ratings.map((r) => (
              <div key={r.id} style={{ flex: "1 1 30%", minWidth: 96, background: "#1C1C21",
                border: "1px solid rgba(212,175,55,0.08)", borderRadius: 12, padding: 12, textAlign: "center" }}>
                <p className="digits" style={{ fontSize: 20, fontWeight: 600 }}>{r.current}{r.provisional ? "?" : ""}</p>
                <p className="text-ivory-meta" style={{ fontSize: 12 }}>{r.timeControl}</p>
              </div>
            ))}
          </div>
        )}
      </div>

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