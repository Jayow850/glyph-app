"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

/**
 * Round control for whoever runs the event. Pairing is blocked while
 * the current round still has unconfirmed results — the Swiss engine
 * needs settled scores before it can pair the next one.
 */
export function ArbiterControls({
  tournamentId, currentRound, totalRounds, status, pendingResults,
}: {
  tournamentId: string;
  currentRound: number;
  totalRounds: number;
  status: string;
  pendingResults: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const allRoundsPaired = currentRound >= totalRounds;
  const blocked = pendingResults > 0;
  const finished = status === "COMPLETED";

  async function call(path: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/${path}`, { method: "POST" });
      if (res.ok) {
        router.refresh();
      } else {
        const text = await res.text();
        setError(text.slice(0, 160) || "That didn't go through.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (finished) {
    return (
      <div className="card">
        <p className="section-label" style={{ marginBottom: 6 }}>Arbiter</p>
        <p className="text-ivory-meta" style={{ fontSize: 14 }}>
          This event is complete. Final ranks and performance ratings are recorded.
        </p>
      </div>
    );
  }

  const btn = (primary: boolean): CSSProperties => ({
    flex: 1,
    borderRadius: 12,
    padding: "12px 0",
    fontWeight: 600,
    fontSize: 15,
    cursor: busy ? "default" : "pointer",
    border: primary ? "none" : "1px solid rgba(212,175,55,0.25)",
    background: primary ? "var(--gold)" : "transparent",
    color: primary ? "var(--gold-ink)" : "var(--text-muted)",
    opacity: busy ? 0.5 : 1,
  });

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p className="section-label">Arbiter</p>

      {blocked && (
        <p style={{ fontSize: 14, color: "var(--danger)" }}>
          Round {currentRound} has {pendingResults} unconfirmed {pendingResults === 1 ? "result" : "results"}.
          Pairing opens once every board is in.
        </p>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        {!allRoundsPaired && (
          <button
            onClick={() => call("pair")}
            disabled={busy || blocked}
            style={{ ...btn(true), opacity: busy || blocked ? 0.4 : 1 }}
          >
            {busy ? "Working…" : `Pair round ${currentRound + 1}`}
          </button>
        )}
        {allRoundsPaired && (
          <button
            onClick={() => call("finalize")}
            disabled={busy || blocked}
            style={{ ...btn(true), opacity: busy || blocked ? 0.4 : 1 }}
          >
            {busy ? "Working…" : "Finalize tournament"}
          </button>
        )}
        <a
          href={`/api/tournaments/${tournamentId}/wallchart`}
          style={{ ...btn(false), textAlign: "center", textDecoration: "none", lineHeight: "24px" }}
        >
          Wallchart PDF
        </a>
      </div>

      {error && <p style={{ fontSize: 13, color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
