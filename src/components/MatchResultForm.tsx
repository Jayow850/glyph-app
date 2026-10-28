"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const OPTIONS = [
  { value: "WHITE_WIN", label: "1–0" },
  { value: "DRAW", label: "½–½" },
  { value: "BLACK_WIN", label: "0–1" },
] as const;

/**
 * Result entry for one board. Either player can submit; the second
 * submission confirms it. An arbiter's submission is official at once.
 */
export function MatchResultForm({ matchId }: { matchId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(result: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result }),
      });
      if (res.ok) router.refresh();
      else setError("Rejected");
    } catch {
      setError("No connection");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => submit(o.value)}
          disabled={busy}
          className="digits"
          style={{
            background: "transparent",
            border: "1px solid rgba(212,175,55,0.25)",
            color: "var(--gold)",
            borderRadius: 8,
            padding: "5px 9px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            opacity: busy ? 0.4 : 1,
          }}
        >
          {o.label}
        </button>
      ))}
      {error && <span style={{ fontSize: 12, color: "var(--danger)" }}>{error}</span>}
    </div>
  );
}
