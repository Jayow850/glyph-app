import Link from "next/link";
import { RatingBadge } from "./RatingDelta";
import { MatchResultForm } from "./MatchResultForm";

export interface PairingRow {
  matchId: string;
  boardNumber: number;
  white: { name: string; rating: number };
  black: { name: string; rating: number } | null; // null = bye
  result: string;
  /** Show result entry for this board to the current viewer. */
  canSubmit?: boolean;
  /** The playable game behind this board, when the round was paired on GLYPH. */
  liveGameId?: string | null;
  /** True when the viewer is one of the two players. */
  yours?: boolean;
}

const RESULT_LABEL: Record<string, string> = {
  WHITE_WIN: "1–0", BLACK_WIN: "0–1", DRAW: "½–½",
  WHITE_FORFEIT: "0–1F", BLACK_FORFEIT: "1–0F",
  BYE_FULL: "bye 1", BYE_HALF: "bye ½", PENDING: "·",
};

const RESULT_COLOR: Record<string, string> = {
  WHITE_WIN: "var(--text)", BLACK_WIN: "var(--text)", DRAW: "var(--draw)",
  PENDING: "var(--text-muted)", BYE_FULL: "var(--text-muted)", BYE_HALF: "var(--text-muted)",
};

export function PairingsTable({ rows, roundNumber }: { rows: PairingRow[]; roundNumber: number }) {
  return (
    <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      <header
        style={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid rgba(212,175,55,0.08)",
        }}
      >
        <h2 className="font-display t-h2">Round {roundNumber}</h2>
        <span className="section-label">{rows.length} boards</span>
      </header>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {rows.map((r, i) => {
          const pending = r.result === "PENDING";
          const playable = pending && Boolean(r.liveGameId);

          return (
            <li
              key={r.matchId}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 20px",
                background: r.yours && pending ? "rgba(212,175,55,0.05)" : "transparent",
                borderBottom: i === rows.length - 1 ? "none" : "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <span
                className="digits"
                style={{
                  fontSize: 12, fontWeight: 600, color: "var(--gold)",
                  background: "rgba(212,175,55,0.12)", borderRadius: 6,
                  padding: "4px 8px", flexShrink: 0, minWidth: 34, textAlign: "center",
                }}
              >
                {r.boardNumber}
              </span>

              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.white.name} <RatingBadge rating={r.white.rating} />
                </p>
                <p
                  className="text-ivory-meta"
                  style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {r.black ? <>{r.black.name} <RatingBadge rating={r.black.rating} /></> : "— bye —"}
                </p>
              </div>

              {playable ? (
                <Link
                  href={`/game/${r.liveGameId}`}
                  style={{
                    flexShrink: 0, textDecoration: "none", borderRadius: 10,
                    padding: "8px 16px", fontSize: 14, fontWeight: 600,
                    background: r.yours ? "var(--gold)" : "transparent",
                    color: r.yours ? "var(--gold-ink)" : "var(--text-muted)",
                    border: r.yours ? "none" : "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  {r.yours ? "Play" : "Watch"}
                </Link>
              ) : r.canSubmit && pending && r.black ? (
                <MatchResultForm matchId={r.matchId} />
              ) : (
                <span
                  className="digits"
                  style={{ fontSize: 15, fontWeight: 600, color: RESULT_COLOR[r.result] ?? "var(--text)", flexShrink: 0 }}
                >
                  {RESULT_LABEL[r.result] ?? r.result}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
