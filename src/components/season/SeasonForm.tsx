"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/** A season runs roughly September to May, splitting at Christmas. */
function defaultDates() {
  const now = new Date();
  // Before July, this year's season is already running; plan the next one.
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const iso = (y: number, m: number, d: number) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return {
    name: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
    startsAt: iso(startYear, 9, 1),
    halfwayAt: iso(startYear, 12, 20),
    endsAt: iso(startYear + 1, 5, 15),
  };
}

/**
 * Open the club's season.
 *
 * Four fields, pre-filled with the shape of an actual club year, so a
 * secretary who just wants "this season, normal dates" taps one button.
 */
export function SeasonForm({
  clubSlug,
  existing,
}: {
  clubSlug: string;
  existing?: { name: string; startsAt: string; halfwayAt: string; endsAt: string } | null;
}) {
  const d = defaultDates();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(existing?.name ?? d.name);
  const [startsAt, setStartsAt] = useState(existing?.startsAt.slice(0, 10) ?? d.startsAt);
  const [halfwayAt, setHalfwayAt] = useState(existing?.halfwayAt.slice(0, 10) ?? d.halfwayAt);
  const [endsAt, setEndsAt] = useState(existing?.endsAt.slice(0, 10) ?? d.endsAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clubs/${clubSlug}/season`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          // Midday, so a timezone offset can never roll a date backwards.
          startsAt: new Date(`${startsAt}T12:00:00`).toISOString(),
          halfwayAt: new Date(`${halfwayAt}T12:00:00`).toISOString(),
          endsAt: new Date(`${endsAt}T12:00:00`).toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "season_dates_out_of_order"
            ? "The dates must run start, then halfway, then end."
            : (data.error ?? "Could not open the season."),
        );
        return;
      }
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
          background: existing ? "transparent" : "var(--gold)",
          color: existing ? "var(--text-muted)" : "var(--gold-ink)",
          border: existing ? "1px solid var(--border)" : "none",
          fontSize: "var(--t-secondary)", fontWeight: 600,
        }}
      >
        <Icon name={existing ? "clock" : "plus"} size={14} />
        {existing ? "Change the season" : "Open a season"}
      </button>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", padding: "var(--s4)",
        display: "flex", flexDirection: "column", gap: "var(--s3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
        <h3 className="t-row" style={{ flex: 1 }}>{existing ? "Change the season" : "Open a season"}</h3>
        <button
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
        <span className="t-caption">Season</span>
        <input style={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "var(--s3)" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="t-caption">Starts</span>
          <input style={field} type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="t-caption">Halfway</span>
          <input style={field} type="date" value={halfwayAt} onChange={(e) => setHalfwayAt(e.target.value)} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="t-caption">Ends</span>
          <input style={field} type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
      </div>

      <p className="t-caption" style={{ color: "var(--text-dim)" }}>
        Halfway splits the autumn and spring halves. The winner of each plays
        off for the club title.
      </p>

      {error && <p className="t-secondary" role="alert" style={{ color: "var(--danger)" }}>{error}</p>}

      {existing && (
        <p className="t-caption" style={{ color: "var(--gold)" }}>
          Opening a new season closes the one running now.
        </p>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="press"
        style={{
          minHeight: 40, padding: "0 18px", borderRadius: "var(--r-full)", border: "none",
          background: "var(--gold)", color: "var(--gold-ink)", alignSelf: "flex-start",
          fontSize: "var(--t-secondary)", fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Saving…" : existing ? "Save" : "Open the season"}
      </button>
    </div>
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
  fontSize: 16, // 16px, or iOS zooms the page on focus
};
