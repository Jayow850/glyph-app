"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

const KINDS = [
  ["MANUAL", "Awarded by the officers"],
  ["SEASON_CHAMPION", "Club champion"],
  ["DIVISION_WINNER", "Division winner"],
  ["LADDER_CHAMPION", "Ladder champion"],
  ["BEST_ATTENDANCE", "Best attendance"],
  ["MOST_IMPROVED", "Most improved"],
] as const;

/**
 * Create a trophy.
 *
 * The name field is empty with a real club's cup as the placeholder,
 * because the naming is the whole point — a trophy called "Division 1
 * Winner" is a badge, and badges are forgotten by Friday.
 *
 * Choosing what wins it is what makes closeSeason able to engrave it
 * without anybody remembering to.
 */
export function TrophyForm({ clubSlug }: { clubSlug: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [namedAfter, setNamedAfter] = useState("");
  const [description, setDescription] = useState("");
  const [awardedFor, setAwardedFor] = useState<string>("MANUAL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy || name.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clubs/${clubSlug}/trophies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          namedAfter: namedAfter.trim() || undefined,
          description: description.trim() || undefined,
          awardedFor,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create it.");
        return;
      }
      setName(""); setNamedAfter(""); setDescription(""); setAwardedFor("MANUAL");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="press"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, minHeight: 38,
          padding: "0 14px", borderRadius: "var(--r-full)", cursor: "pointer",
          background: "transparent", border: "1px solid var(--border)",
          color: "var(--text-muted)", fontSize: "var(--t-secondary)", fontWeight: 600,
        }}
      >
        <Icon name="plus" size={14} />
        Add a trophy
      </button>
    );
  }

  return (
    <form
      onSubmit={create}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", padding: "var(--s4)",
        display: "flex", flexDirection: "column", gap: "var(--s3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
        <h3 className="t-row" style={{ flex: 1 }}>Add a trophy</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
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

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="t-caption">Name</span>
        <input
          style={field}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The Cookworthy Cup"
          maxLength={80}
          required
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="t-caption">Named after (optional)</span>
        <input
          style={field}
          value={namedAfter}
          onChange={(e) => setNamedAfter(e.target.value)}
          placeholder="A member who served the club"
          maxLength={120}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="t-caption">What wins it</span>
        <select style={field} value={awardedFor} onChange={(e) => setAwardedFor(e.target.value)}>
          {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="t-caption" style={{ color: "var(--text-dim)" }}>
          {awardedFor === "MANUAL"
            ? "You engrave this one yourself, whenever the club decides."
            : "Engraved automatically when the season closes."}
        </span>
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="t-caption">Description (optional)</span>
        <input
          style={field}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Presented in 1974 by…"
          maxLength={500}
        />
      </label>

      {error && <p className="t-secondary" role="alert" style={{ color: "var(--danger)" }}>{error}</p>}

      <button
        type="submit"
        disabled={busy || name.trim().length < 2}
        className="press"
        style={{
          minHeight: 40, padding: "0 18px", borderRadius: "var(--r-full)", border: "none",
          background: "var(--gold)", color: "var(--gold-ink)", alignSelf: "flex-start",
          fontSize: "var(--t-secondary)", fontWeight: 600,
          cursor: busy ? "default" : "pointer",
          opacity: busy || name.trim().length < 2 ? 0.5 : 1,
        }}
      >
        {busy ? "Creating…" : "Create the trophy"}
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
