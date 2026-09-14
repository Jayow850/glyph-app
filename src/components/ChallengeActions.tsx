"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChallengeActions({ handle, challengeId }: { handle?: string; challengeId?: string }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const router = useRouter();

  async function send() {
    setBusy(true);
    const res = await fetch("/api/challenges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toHandle: handle, timeControl: "900+10", rated: true }),
    });
    setBusy(false);
    if (res.ok) { setSent(true); router.refresh(); }
  }

  async function accept() {
    setBusy(true);
    const res = await fetch(`/api/challenges/${challengeId}/accept`, { method: "POST" });
    setBusy(false);
    if (res.ok) {
      const data = await res.json();
      if (data.gameId) router.push(`/game/${data.gameId}`);
      else router.refresh();
    }
  }

  if (challengeId) {
    return (
      <button onClick={accept} disabled={busy} className="bg-gold text-night"
        style={{ borderRadius: 999, padding: "8px 16px", fontWeight: 600, fontSize: 13, border: "none", cursor: "pointer" }}>
        {busy ? "…" : "Accept"}
      </button>
    );
  }

  return (
    <button onClick={send} disabled={busy || sent} className="text-gold"
      style={{ border: "1px solid rgba(212,175,55,0.5)", background: "none", borderRadius: 999,
               padding: "6px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: sent ? 0.5 : 1 }}>
      {sent ? "Sent ✓" : busy ? "…" : "Challenge"}
    </button>
  );
}