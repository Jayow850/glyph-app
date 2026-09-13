"use client";
import { useState } from "react";

/** The crown jewel: gold pawn like with the 300ms promotion animation.
 *  §4: 44×44 minimum tap target, 6px icon-count gap, tabular count. */
export function PawnLike({ liked, count, onToggle }: { liked: boolean; count: number; onToggle: () => void }) {
  const [promoting, setPromoting] = useState(false);
  return (
    <button
      onClick={() => {
        if (!liked) { setPromoting(true); setTimeout(() => setPromoting(false), 320); }
        onToggle();
      }}
      className={liked ? "text-gold" : "text-ivory-meta"}
      style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 44, minHeight: 44 }}
      aria-label={liked ? "Remove pawn" : "Give a pawn"}
    >
      <span className={promoting ? "promoting text-gold-hover" : ""} style={{ fontSize: 18, lineHeight: 1 }}>
        {promoting ? "♛" : liked ? "♟" : "♙"}
      </span>
      <span className="digits" style={{ fontSize: 13, fontWeight: 500 }}>{count}</span>
    </button>
  );
}
