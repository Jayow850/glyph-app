"use client";
import { useState } from "react";
import { EloChip } from "./EloChip";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { RailMark, RAIL_COLOR } from "@/components/game/RailMarks";
import { WelcomeButton } from "@/components/club/WelcomeButton";
import { CommentThread } from "./CommentThread";
import { Board, fenToFrame } from "./Board";
import { GameReplay } from "./GameReplay";

export interface PostDto {
  id: string;
  type: "TEXT" | "PHOTO" | "VIDEO" | "GAME" | "PUZZLE" | "CLIP" | "LIVE" | "POSITION" | "MILESTONE" | "BRILLIANCY" | "WELCOME";
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
  const welcomes = post.reactions.filter((r) => r.kind === "WELCOME").length;

  async function toggleLike() {
    setLiked(!liked);
    await fetch(`/api/posts/${post.id}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "PAWN" }),
    }).catch(() => setLiked(liked));
  }

  const reactionStyle = { display: "flex", alignItems: "center", gap: 6, minWidth: 44, minHeight: 44 } as const;

  if (post.type === "WELCOME") {
    return (
      <article
        className="cascade"
        style={{
          display: "flex", alignItems: "center", gap: "var(--s3)",
          padding: "var(--s4)", borderRadius: "var(--r-lg)",
          background: "var(--surface)", border: "1px solid var(--border-gold)",
        }}
      >
        <Avatar name={post.author.profile?.fullName ?? "A new member"} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="t-row">{post.author.profile?.fullName ?? "A new member"}</p>
          <p className="t-rowmeta">
            joined{post.club ? ` ${post.club.name}` : " the club"}
            {welcomes > 0 && <> · <span className="digits">{welcomes}</span> welcomed them</>}
          </p>
        </div>
        <WelcomeButton postId={post.id} count={welcomes} compact />
      </article>
    );
  }

  return (
    <article className="card cascade">
      {/* Header grid: 44px avatar | name/handle column | badge pinned right */}
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar name={post.author.profile?.fullName ?? post.author.profile?.handle ?? "Player"} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="t-row" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {post.author.profile?.title && post.author.profile.title !== "NONE" && (
              <span className="text-gold" style={{ marginRight: 4 }}>{post.author.profile.title}</span>
            )}
            {post.author.profile?.fullName ?? "player"}
            {elo && <span style={{ marginLeft: 8 }}><EloChip elo={elo} /></span>}
          </p>
          <p className="t-rowmeta">
            @{post.author.profile?.handle}{post.club ? ` · ${post.club.name}` : ""}
          </p>
        </div>
        {post.type !== "TEXT" && post.type !== "PHOTO" && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--gold)", border: "1px solid var(--border-gold)", borderRadius: "var(--r-full)", padding: "4px 8px", flexShrink: 0 }}>
            {post.type === "LIVE" ? "● LIVE" : post.type}
          </span>
        )}
      </header>

      {/* Body: 12px from header, 16px rhythm inside */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        {post.body && <p className="t-body">{post.body}</p>}

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

        {post.type === "GAME" && post.pgn && <GameReplay pgn={post.pgn} />}
      </div>

      {/* §4 — hairline divider, 16px both sides, then the reaction row */}
      <div className="hairline" style={{ marginTop: 16 }} />
      <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s5)" }}>
          {/* One reaction language across GLYPH: the same chess marks
              the rail uses. 👑 and 🔥 drew a different picture on every
              platform and said nothing about chess. */}
          <button
            onClick={toggleLike}
            aria-label="Respect"
            style={{
              ...reactionStyle, background: "none", border: "none", cursor: "pointer",
              fontSize: 13, color: liked ? RAIL_COLOR.RESPECT : "var(--text-muted)",
            }}
          >
            <RailMark kind="RESPECT" size={17} />
            <span className="digits">{pawns}</span>
          </button>

          <span style={{ ...reactionStyle, fontSize: 13, color: "var(--text-muted)" }}>
            <span style={{ color: RAIL_COLOR.BRILLIANT, display: "block" }}>
              <RailMark kind="BRILLIANT" size={17} />
            </span>
            <span className="digits">{brilliants}</span>
            {gmApproved && (
              <span style={{ marginLeft: 4, color: "var(--gold)", fontWeight: 600 }}>GM-approved</span>
            )}
          </span>

          <span style={{ ...reactionStyle, fontSize: 13, color: "var(--text-muted)" }}>
            <span style={{ color: RAIL_COLOR.NICE, display: "block" }}>
              <RailMark kind="NICE" size={17} />
            </span>
            <span className="digits">{fire}</span>
          </span>
        </div>
        <button
          onClick={() => setShowComments(!showComments)}
          aria-label="Comments"
          style={{
            ...reactionStyle, background: "none", border: "none", cursor: "pointer",
            fontSize: 13, color: "var(--text-muted)", justifyContent: "flex-end",
          }}
        >
          <Icon name="chat" size={17} />
          <span className="digits">{post._count.comments}</span>
        </button>
      </footer>

      {showComments && <CommentThread postId={post.id} />}
    </article>
  );
}