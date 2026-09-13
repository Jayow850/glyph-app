"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ComposePage() {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function publish() {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "TEXT", body: body.trim() }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "You need to sign in first." : "Could not publish. Try again.");
        setBusy(false);
        return;
      }
      router.push("/feed");
      router.refresh();
    } catch {
      setError("Network problem. Is the server running?");
      setBusy(false);
    }
  }

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 className="font-display" style={{ fontSize: 24 }}>Your move.</h1>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder="Share a game, a thought, a blunder you're still mad about…"
        style={{
          width: "100%", background: "#16161A", color: "#F5F1E8",
          border: "1px solid rgba(212,175,55,0.15)", borderRadius: 12,
          padding: 12, fontSize: 16, lineHeight: 1.55, outline: "none",
          resize: "none", boxSizing: "border-box",
        }}
      />

      {error && <p style={{ color: "#B0575A", fontSize: 14 }}>{error}</p>}

      <button
        onClick={publish}
        disabled={busy || !body.trim()}
        className="bg-gold text-night"
        style={{
          borderRadius: 12, padding: "12px 0", fontWeight: 600, fontSize: 15,
          opacity: busy || !body.trim() ? 0.5 : 1, border: "none", cursor: "pointer",
        }}
      >
        {busy ? "Publishing…" : "♟ Publish"}
      </button>
    </div>
  );
}