"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Accept or turn down a challenge. Accepting goes straight to the board —
 * nobody wants a confirmation screen between them and a game.
 */
export function ChallengeActions({
  challengeId,
  mine = false,
}: {
  challengeId: string;
  /** True when this is a challenge you sent, so the only action is to withdraw. */
  mine?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function accept() {
    setBusy(true);
    try {
      const res = await fetch(`/api/challenges/${challengeId}/accept`, { method: "POST" });
      if (res.ok) {
        const { gameId } = await res.json();
        router.push(`/game/${gameId}`);
        return;
      }
    } catch {
      /* fall through to re-enable the button */
    }
    setBusy(false);
    router.refresh();
  }

  async function decline() {
    setBusy(true);
    try {
      await fetch(`/api/challenges/${challengeId}/decline`, { method: "POST" });
    } catch {
      /* best effort */
    }
    setBusy(false);
    router.refresh();
  }

  const ghost = {
    background: "var(--surface-2)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "var(--text-muted)",
    borderRadius: 10,
    padding: "8px 14px",
    fontSize: 14,
    cursor: "pointer",
    opacity: busy ? 0.5 : 1,
  } as const;

  if (mine) {
    return (
      <button onClick={decline} disabled={busy} style={ghost}>Withdraw</button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
      <button
        onClick={accept}
        disabled={busy}
        style={{
          background: "var(--gold)", color: "var(--gold-ink)", border: "none",
          borderRadius: 10, padding: "8px 16px", fontSize: 14, fontWeight: 600,
          cursor: "pointer", opacity: busy ? 0.5 : 1,
        }}
      >
        {busy ? "…" : "Accept"}
      </button>
      <button onClick={decline} disabled={busy} style={ghost}>Decline</button>
    </div>
  );
}
