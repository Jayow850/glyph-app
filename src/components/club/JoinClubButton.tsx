"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Join a club.
 *
 * This was an `<a href="/api/clubs/[slug]/join">` — a link, issuing a
 * GET, to a route that only answers POST. It could never have worked;
 * clicking it navigated to a 405. Joining is a write, so it is a
 * button that posts and reports what came back, including the two
 * refusals the route can give: an invite-only club and a scholastic
 * club that needs a linked parent account.
 */
export function JoinClubButton({ slug, invite }: { slug: string; invite?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const url = `/api/clubs/${slug}/join${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`;
      const res = await fetch(url, { method: "POST" });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not join this club.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
      <button
        onClick={join}
        disabled={busy}
        className="press"
        style={{
          minHeight: 48, borderRadius: "var(--r-md)", border: "none", width: "100%",
          fontSize: "var(--t-body)", fontWeight: 600,
          background: "var(--gold)", color: "var(--gold-ink)",
          cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Joining…" : "Join club"}
      </button>
      {error && <p style={{ color: "var(--danger)", fontSize: "var(--t-caption)" }}>{error}</p>}
    </div>
  );
}
