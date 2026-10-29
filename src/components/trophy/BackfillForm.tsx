"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/**
 * Type in the cup.
 *
 * This is how a fifty-year-old club arrives on GLYPH with its history
 * intact, so it is built for one sitting with the trophy on the table:
 * the year keeps focus and the form clears to the next entry, so a
 * secretary can go 1974, 1975, 1976 without touching the mouse.
 *
 * A winner is a name, not an account. Most of the names on a real cup
 * belong to people who will never sign up, and some to people who are
 * dead. Demanding a GLYPH user here would throw away the history, which
 * is the one thing the cup is for.
 */
export function BackfillForm({ trophyId, trophyName }: { trophyId: string; trophyName: string }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState("");
  const [winnerName, setWinnerName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const router = useRouter();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !year.trim() || !winnerName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trophies/${trophyId}/awards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: year.trim(),
          winnerName: winnerName.trim(),
          note: note.trim() || undefined,
          // Backfill is quiet. Nobody wants fifty notifications about 1974.
          announce: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not add that one.");
        return;
      }
      setAdded(added + 1);
      // Clear for the next year, keep the form open and focused.
      setWinnerName("");
      setNote("");
      setYear("");
      router.refresh();
      document.getElementById("backfill-year")?.focus();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div style={{ textAlign: "center" }}>
        <button
          onClick={() => setOpen(true)}
          className="press"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, minHeight: 38,
            padding: "0 16px", borderRadius: "var(--r-full)", cursor: "pointer",
            background: "transparent", border: "1px solid var(--border)",
            color: "var(--text-muted)", fontSize: "var(--t-secondary)", fontWeight: 600,
          }}
        >
          <Icon name="plus" size={14} />
          Add past winners
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={add}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", padding: "var(--s4)",
        display: "flex", flexDirection: "column", gap: "var(--s3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="t-row">Add a past winner</p>
          <p className="t-rowmeta">
            {added > 0
              ? `${added} added. Keep going — the form stays open.`
              : // Club trophies are usually called "The Something Cup",
                // so an added article gives "the The Cookworthy Cup".
                `As far back as ${trophyName} goes.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Done"
          className="press"
          style={{
            width: 32, height: 32, borderRadius: "var(--r-md)", flexShrink: 0,
            display: "grid", placeItems: "center", cursor: "pointer",
            background: "transparent", border: "none", color: "var(--text-dim)",
          }}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(90px, 1fr) 2fr", gap: "var(--s3)" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="t-caption">Year</span>
          <input
            id="backfill-year"
            style={field}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="1974"
            maxLength={20}
            required
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="t-caption">Winner</span>
          <input
            style={field}
            value={winnerName}
            onChange={(e) => setWinnerName(e.target.value)}
            placeholder="As engraved"
            maxLength={120}
            required
          />
        </label>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="t-caption">Note (optional)</span>
        <input
          style={field}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Shared, or the division, or anything worth recording"
          maxLength={200}
        />
      </label>

      <p className="t-caption" style={{ color: "var(--text-dim)" }}>
        Write the year exactly as it reads on the cup — <span className="digits">1987-88</span> if
        that is what it says.
      </p>

      {error && <p className="t-secondary" role="alert" style={{ color: "var(--danger)" }}>{error}</p>}

      <button
        type="submit"
        disabled={busy || !year.trim() || !winnerName.trim()}
        className="press"
        style={{
          minHeight: 42, padding: "0 18px", borderRadius: "var(--r-full)", border: "none",
          background: "var(--gold)", color: "var(--gold-ink)", alignSelf: "flex-start",
          fontSize: "var(--t-secondary)", fontWeight: 600,
          cursor: busy ? "default" : "pointer",
          opacity: busy || !year.trim() || !winnerName.trim() ? 0.5 : 1,
        }}
      >
        {busy ? "Adding…" : "Add to the roll"}
      </button>
    </form>
  );
}

const field: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 var(--s2)",
  borderRadius: "var(--r-md)",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontSize: 16,
};
