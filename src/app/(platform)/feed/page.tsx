import { forYou } from "@/lib/services/feed";
import { PostCard, type PostDto } from "@/components/social/PostCard";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const posts = (await forYou()) as unknown as PostDto[];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 12 }}>
      {posts.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <p className="font-display" style={{ fontSize: 22 }}>The board is set.</p>
          <p className="text-ivory-meta" style={{ fontSize: 15, marginTop: 4 }}>Make the first move.</p>
        </div>
      ) : (
        posts.map((p) => <PostCard key={p.id} post={p} />)
      )}
    </div>
  );
}
