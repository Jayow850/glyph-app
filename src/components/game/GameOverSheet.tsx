"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/ui/Sheet";
import { Avatar } from "@/components/ui/Avatar";
import { Flag } from "@/components/ui/Flag";
import { Icon } from "@/components/ui/Icon";

/** Sentence case, no capitals mid-line — this sits under a headline. */
const REASON_TEXT: Record<string, string> = {
  checkmate: "by checkmate",
  resign: "by resignation",
  timeout: "on time",
  timeout_vs_insufficient: "on time, with insufficient material to mate",
  draw_agreed: "by agreement",
  stalemate: "by stalemate",
  fifty: "by the fifty-move rule",
  threefold: "by threefold repetition",
  material: "with insufficient material",
  aborted: "aborted before it began",
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
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(value * eased));
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

/**
 * One player's line. A rating is a number that moved, so it says where
 * it moved from and to — a bare "+12" makes you do arithmetic at the
 * one moment you are not in the mood for it.
 *
 * The winner's row lifts very slightly. The loser's row is left alone:
 * losing a game of chess is punishment enough without the interface
 * joining in.
 */
function Side({
  name, rating, delta, country, title, won, rated,
}: {
  name: string;
  rating: string;
  delta: number | null;
  country?: string | null;
  title?: string | null;
  won: boolean;
  rated: boolean;
}) {
  const now = Number(rating.replace(/\D/g, ""));
  const before = delta !== null && Number.isFinite(now) ? now - delta : null;
  const hasTitle = Boolean(title) && title !== "NONE";

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "var(--s3)",
        padding: "var(--s3)", borderRadius: "var(--r-md)",
        background: won ? "var(--gold-wash)" : "transparent",
      }}
    >
      <Avatar name={name} size={38} ring={won} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {hasTitle && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "var(--gold)", color: "var(--gold-ink)", flexShrink: 0 }}>
              {title}
            </span>
          )}
          <span style={{ fontSize: "var(--t-secondary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </span>
          {country && <Flag code={country} height={11} />}
        </div>

        <p className="t-caption digits" style={{ color: "var(--text-muted)" }}>
          {rated && before !== null ? <>{before} → <span style={{ color: "var(--text)", fontWeight: 600 }}>{rating}</span></> : rating}
        </p>
      </div>

      <Delta value={rated ? delta : null} />
    </div>
  );
}

function summary(moves: number, seconds: number | null, led: number | null) {
  const parts = [`${moves} ${moves === 1 ? "move" : "moves"}`];
  if (seconds !== null && seconds > 0) {
    const m = Math.floor(seconds / 60);
    parts.push(m >= 1 ? `${m} min ${seconds % 60} s` : `${seconds} s`);
  }
  if (led !== null && led > 0) parts.push(`ahead for ${led}% of it`);
  return parts.join(" · ");
}

/**
 * The end of a game is the most emotionally loaded moment in chess
 * software, and until now GLYPH simply stopped. This is the payoff:
 * what happened, what it cost or earned, and the one thing you most
 * want next — another game.
 *
 * It is deliberately the last step of a sequence. The board holds, a
 * result band sweeps across it, and only then does this rise. A sheet
 * that arrives over a half-rendered board robs the moment of its beat.
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
  whiteCountry,
  blackCountry,
  whiteTitle,
  blackTitle,
  rated,
  moves,
  seconds,
  ledPercent,
  gameId,
  onRevealRail,
  railCount = 0,
  onRematch,
  rematchState,
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
  whiteCountry?: string | null;
  blackCountry?: string | null;
  whiteTitle?: string | null;
  blackTitle?: string | null;
  rated: boolean;
  /** Full moves, not plies. */
  moves: number;
  seconds: number | null;
  /** Share of the game you led on material, or null for a spectator. */
  ledPercent: number | null;
  gameId: string;
  /** Opens the whisper thread. Absent for a spectator. */
  onRevealRail?: () => void;
  railCount?: number;
  onRematch: () => void;
  rematchState: "idle" | "sent" | "accepted";
  onShare: () => void;
  shared: boolean;
  busy: boolean;
}) {
  const drew = result === "1/2-1/2";
  const won = youAre !== null && !drew && ((youAre === "w" && result === "1-0") || (youAre === "b" && result === "0-1"));
  const aborted = endReason === "aborted";

  const headline =
    aborted ? "Aborted"
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

  const whiteWon = result === "1-0";
  const blackWon = result === "0-1";

  return (
    <Sheet open={open} onClose={onClose} title="">
      <div style={{ marginTop: "calc(-1 * var(--s4))", marginBottom: "var(--s4)" }}>
        <h2 className="font-display" style={{ fontSize: "var(--t-display)", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
          {headline}
        </h2>
        <p className="t-secondary" style={{ marginTop: 2 }}>
          {endReason ? REASON_TEXT[endReason] ?? endReason : "game over"}
          {!rated && !aborted && " · casual"}
        </p>
      </div>

      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "var(--s1)",
          marginBottom: "var(--s3)",
        }}
      >
        <Side
          name={whiteName} rating={whiteRating} delta={whiteDelta}
          country={whiteCountry} title={whiteTitle} won={whiteWon} rated={rated}
        />
        <div className="hairline" style={{ margin: "0 var(--s3)" }} />
        <Side
          name={blackName} rating={blackRating} delta={blackDelta}
          country={blackCountry} title={blackTitle} won={blackWon} rated={rated}
        />
      </div>

      {moves > 0 && (
        <p className="t-caption digits" style={{ color: "var(--text-muted)", marginBottom: "var(--s4)" }}>
          {summary(moves, seconds, ledPercent)}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s3)", paddingBottom: "var(--s4)" }}>
        {youAre && (
          <div style={{ display: "flex", gap: "var(--s3)" }}>
            <button
              onClick={onRematch}
              disabled={busy || rematchState !== "idle"}
              className="press"
              style={button(true)}
            >
              <Icon name="swords" size={18} />
              {rematchState === "sent" ? "Offered…" : rematchState === "accepted" ? "Accepted" : "Rematch"}
            </button>
            <button onClick={onShare} disabled={busy || shared} className="press" style={button(false)}>
              <Icon name="send" size={18} />
              {shared ? "Shared" : "Share"}
            </button>
          </div>
        )}

        {onRevealRail && railCount > 0 && (
          <button
            onClick={onRevealRail}
            className="press"
            style={{ ...button(false), minHeight: 46, borderColor: "var(--gold)", color: "var(--gold)" }}
          >
            <Icon name="chat" size={17} />
            Reveal what the rail said · {railCount}
          </button>
        )}

        <div style={{ display: "flex", gap: "var(--s3)" }}>
          <button onClick={onClose} className="press" style={{ ...button(false), minHeight: 44 }}>
            <Icon name="grid" size={17} />
            Review board
          </button>
          <Link href="/challenges" className="press" style={{ ...button(false), minHeight: 44 }}>
            Back to Games
          </Link>
        </div>
      </div>
    </Sheet>
  );
}
