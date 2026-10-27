"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/ui/Sheet";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";

const REASON_TEXT: Record<string, string> = {
  checkmate: "by checkmate",
  resign: "by resignation",
  timeout: "on time",
  timeout_vs_insufficient: "on time — insufficient material",
  draw_agreed: "by agreement",
  stalemate: "by stalemate",
  fifty: "by the fifty-move rule",
  threefold: "by threefold repetition",
  material: "— insufficient material",
  aborted: "— aborted before it began",
};

/** Counts the number up, because a rating change should feel earned. */
function Delta({ value }: { value: number | null }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (value === null) return;
    const start = performance.now();
    const duration = 650;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out so it lands softly rather than stopping dead
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  if (value === null) return <span className="digits" style={{ color: "var(--text-dim)" }}>—</span>;

  return (
    <span
      className="digits"
      style={{
        fontSize: 17,
        fontWeight: 700,
        color: value > 0 ? "var(--success)" : value < 0 ? "var(--danger)" : "var(--text-muted)",
      }}
    >
      {shown > 0 ? "+" : ""}{shown}
    </span>
  );
}

function Side({ name, rating, delta }: { name: string; rating: string; delta: number | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)", padding: "var(--s2) 0" }}>
      <Avatar name={name} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "var(--t-secondary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </p>
        <p className="t-caption digits" style={{ color: "var(--text-muted)" }}>{rating}</p>
      </div>
      <Delta value={delta} />
    </div>
  );
}

/**
 * The end of a game is the most emotionally loaded moment in chess
 * software, and until now GLYPH simply stopped. This is the payoff:
 * what happened, what it cost or earned, and the one thing you most
 * want next — another game.
 */
export function GameOverSheet({
  open,
  onClose,
  youAre,
  result,
  endReason,
  whiteName,
  blackName,
  whiteRating,
  blackRating,
  whiteDelta,
  blackDelta,
  rated,
  onRematch,
  onShare,
  shared,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  youAre: "w" | "b" | null;
  result: string | null;
  endReason: string | null;
  whiteName: string;
  blackName: string;
  whiteRating: string;
  blackRating: string;
  whiteDelta: number | null;
  blackDelta: number | null;
  rated: boolean;
  onRematch: () => void;
  onShare: () => void;
  shared: boolean;
  busy: boolean;
}) {
  const drew = result === "1/2-1/2";
  const won = youAre !== null && !drew && ((youAre === "w" && result === "1-0") || (youAre === "b" && result === "0-1"));

  const headline =
    endReason === "aborted" ? "Game aborted"
    : youAre === null ? (drew ? "Draw" : result === "1-0" ? "White won" : "Black won")
    : drew ? "Draw"
    : won ? "You won" : "You lost";

  const button = (primary: boolean) => ({
    flex: 1, minHeight: 48, borderRadius: "var(--r-md)",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--s2)",
    fontSize: "var(--t-body)", fontWeight: 600, cursor: busy ? "default" : "pointer",
    background: primary ? "var(--gold)" : "var(--surface-2)",
    color: primary ? "var(--gold-ink)" : "var(--text)",
    border: primary ? "1px solid transparent" : "1px solid var(--border)",
    textDecoration: "none",
    opacity: busy ? 0.55 : 1,
  });

  return (
    <Sheet open={open} onClose={onClose} title={headline}>
      <p className="t-secondary" style={{ marginTop: "calc(-1 * var(--s2))", marginBottom: "var(--s4)" }}>
        {endReason ? REASON_TEXT[endReason] ?? endReason : "Game over"}
        {!rated && " · casual"}
      </p>

      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "var(--s2) var(--s3)",
          marginBottom: "var(--s4)",
        }}
      >
        <Side name={whiteName} rating={whiteRating} delta={rated ? whiteDelta : null} />
        <div className="hairline" />
        <Side name={blackName} rating={blackRating} delta={rated ? blackDelta : null} />
      </div>

      {youAre && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
          <div style={{ display: "flex", gap: "var(--s3)" }}>
            <button onClick={onRematch} disabled={busy} className="press" style={button(true)}>
              <Icon name="swords" size={18} />
              Rematch
            </button>
            <button onClick={onShare} disabled={busy || shared} className="press" style={button(false)}>
              <Icon name="send" size={18} />
              {shared ? "Shared" : "Share"}
            </button>
          </div>

          <Link href="/challenges" className="press" style={{ ...button(false), minHeight: 44 }}>
            Back to Games
          </Link>
        </div>
      )}
    </Sheet>
  );
}
