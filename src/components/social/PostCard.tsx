"use client";
import { useState } from "react";
import { PawnLike } from "./PawnLike";
import { EloChip } from "./EloChip";
import { CommentThread } from "./CommentThread";
import { Board, fenToFrame } from "./Board";

export interface PostDto {
  id: string;
  type: "TEXT" | "PHOTO" | "VIDEO" | "GAME" | "PUZZLE" | "CLIP" | "LIVE";
  body?: string;
  mediaUrls: string[];
  videoUrl?: string;
  pgn?: string;
  puzzleFen?: string;
  solveCount: number;
  attemptCount: number;
  createdAt: string;
  author: { profile?: { fullName?: string; handle?: string; title?: string }; ratings?: { current: number }[] };
  club?: { name: string; slug: string } | null;
  reactions: { kind: string; reactorElo?: number | null }[];
  _count: { comments: number };
}

/** §3/§4 precision card: 20px pad, 16px radius, uniform header grid,
 *  hairline divider, engineered reaction row with 44px targets. */
export function PostCard({ post, meLiked = false }: { post: PostDto; meLiked?: boolean }) {
  const [liked, setLiked] = useState(meLiked);
  const [showComments, setShowComments] = useState(false);

  const base = post.reactions.filter((r) => r.kind === "PAWN").length;
  const pawns = base + (liked && !meLiked ? 1 : 0) - (!liked && meLiked ? 1 : 0);
  const brilliants = post.reactions.filter((r) => r.kind === "BRILLIANT").length;
  const fire = post.reactions.filter((r) => r.kind === "FIRE").length;
  const gmApproved = post.reactions.some((r) => r.kind === "BRILLIANT" && (r.reactorElo ?? 0) >= 2200);
  const elo = post.author.ratings?.[0]?.current;

  async function toggleLike() {
    setLiked(!liked);
    await fetch(`/api/posts/${post.id}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "PAWN" }),
    }).catch(() => setLiked(liked));
  }

  const reactionStyle = { display: "flex", alignItems: "center", gap: 6, minWidth: 44, minHeight: 44 } as const;

  return (
    <article className="card cascade">
      {/* Header grid: 44px avatar | name/handle column | badge pinned right */}
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center",
            background: "#1C1C21", border: "1px solid rgba(212,175,55,0.08)", fontSize: 20, flexShrink: 0,
          }}
        >
          ♟
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-display" style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {post.author.profile?.title && post.author.profile.title !== "NONE" && (
              <span className="text-gold" style={{ marginRight: 4 }}>{post.author.profile.title}</span>
            )}
            {post.author.profile?.fullName ?? "player"}
            {elo && <span style={{ marginLeft: 8 }}><EloChip elo={elo} /></span>}
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.3 }} className="text-ivory-meta">
            @{post.author.profile?.handle}{post.club ? ` · ${post.club.name}` : ""}
          </p>
        </div>
        {post.type !== "TEXT" && post.type !== "PHOTO" && (
          <span className="text-gold" style={{ fontSize: 10, letterSpacing: "0.08em", border: "1px solid rgba(212,175,55,0.15)", borderRadius: 999, padding: "4px 8px", flexShrink: 0 }}>
            {post.type === "LIVE" ? "● LIVE" : post.type}
          </span>
        )}
      </header>

      {/* Body: 12px from header, 16px rhythm inside */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        {post.body && <p style={{ fontSize: 16, lineHeight: 1.55 }}>{post.body}</p>}

        {post.type === "PHOTO" && post.mediaUrls.length > 0 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollSnapType: "x mandatory", borderRadius: 8 }}>
            {post.mediaUrls.map((u) => (
              <img key={u} src={u} alt="" loading="lazy" style={{ height: 224, borderRadius: 8, objectFit: "cover", scrollSnapAlign: "start" }} />
            ))}
          </div>
        )}

        {(post.type === "VIDEO" || post.type === "CLIP") && post.videoUrl && (
          <video
            src={post.videoUrl}
            controls
            playsInline
            muted
            preload="metadata"
            style={{
              width: "100%", borderRadius: 8,
              ...(post.type === "CLIP" ? { aspectRatio: "9 / 16", maxHeight: 384, objectFit: "cover" as const } : {}),
            }}
          />
        )}

        {post.type === "PUZZLE" && post.puzzleFen && <Board frame={fenToFrame(post.puzzleFen)} />}
      </div>

      {/* §4 — hairline divider, 16px both sides, then the reaction row */}
      <div className="hairline" style={{ marginTop: 16 }} />
      <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <PawnLike liked={liked} count={pawns} onToggle={toggleLike} />
          <span className="text-ivory-meta" style={{ ...reactionStyle, fontSize: 13 }}>
            <span style={{ fontSize: 16 }}>👑</span>
            <span className="digits">{brilliants}</span>
            {gmApproved && <span className="font-display text-gold" style={{ marginLeft: 4 }}>GM-approved</span>}
          </span>
          <span className="text-ivory-meta" style={{ ...reactionStyle, fontSize: 13 }}>
            <span style={{ fontSize: 16 }}>🔥</span>
            <span className="digits">{fire}</span>
          </span>
        </div>
        <button onClick={() => setShowComments(!showComments)} className="text-ivory-meta" style={{ ...reactionStyle, fontSize: 13, justifyContent: "flex-end" }}>
          💬 <span className="digits">{post._count.comments}</span>
        </button>
      </footer>

      {showComments && <CommentThread postId={post.id} />}
    </article>
  );
}
