"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { PRESETS } from "@engine/game/timeControls";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The exact instant of the next <dayOfWeek> at <hh:mm> **in this
 * browser's timezone**.
 *
 * This is the whole timezone fix. The organiser picks a weekday and a
 * clock time; the browser — which is the only party that knows what
 * evening they mean — turns that into an instant, and the server
 * stores it without reinterpreting it.
 */
function nextLocalOccurrence(dayOfWeek: number, time: string): Date {
  const [hh, mm] = time.split(":").map(Number);
  const when = new Date();
  when.setSeconds(0, 0);
  when.setHours(hh, mm);
  while (when.getDay() !== dayOfWeek || when.getTime() <= Date.now()) {
    when.setDate(when.getDate() + 1);
  }
  return when;
}

export function ClubNightForm({
  clubSlug,
  initial,
}: {
  clubSlug: string;
  /** Present when a night already exists, so this edits rather than creates. */
  initial?: { dayOfWeek: number; startsAt: string; timeControl: string; rounds: number } | null;
}) {
  const existing = Boolean(initial);
  const [open, setOpen] = useState(false);

  const start = initial ? new Date(initial.startsAt) : null;
  const [dayOfWeek, setDayOfWeek] = useState(initial?.dayOfWeek ?? 3);
  const [time, setTime] = useState(
    start
      ? `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`
      : "19:30",
  );
  const [timeControl, setTimeControl] = useState(initial?.timeControl ?? "600+5");
  const [rounds, setRounds] = useState(initial?.rounds ?? 3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const preview = nextLocalOccurrence(dayOfWeek, time);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clubs/${clubSlug}/club-night`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: nextLocalOccurrence(dayOfWeek, time).toISOString(),
          dayOfWeek,
          timeControl,
          rounds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "night_in_progress"
            ? "A night is running right now. Finish it first."
            : (data.error ?? "Could not save."),
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

  async function stop() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/clubs/${clubSlug}/club-night`, { method: "DELETE" });
      setOpen(false);
      router.refresh();
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
          display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36,
          padding: "0 14px", borderRadius: "var(--r-full)", cursor: "pointer",
          background: existing ? "transparent" : "var(--gold)",
          color: existing ? "var(--text-muted)" : "var(--gold-ink)",
          border: existing ? "1px solid var(--border)" : "none",
          fontSize: "var(--t-secondary)", fontWeight: 600,
        }}
      >
        <Icon name={existing ? "clock" : "plus"} size={14} />
        {existing ? "Change club night" : "Set up a club night"}
      </button>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: "var(--s4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--s3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
        <h3 className="t-row" style={{ flex: 1 }}>{existing ? "Change club night" : "Set up a club night"}</h3>
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

      {/* Two columns on anything wider than a small phone, stacked below. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--s3)" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="t-caption">Every</span>
          <select style={select} value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="t-caption">At</span>
          <input style={select} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="t-caption">Clock</span>
          <select style={select} value={timeControl} onChange={(e) => setTimeControl(e.target.value)}>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="t-caption">Rounds</span>
          <select style={select} value={rounds} onChange={(e) => setRounds(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {/* Spelled out in the organiser's own timezone, so there is no
          doubt about which evening they just scheduled. */}
      <p className="t-rowmeta">
        Next one:{" "}
        <span style={{ color: "var(--text)" }}>
          {preview.toLocaleString(undefined, {
            weekday: "long", day: "numeric", month: "short",
            hour: "numeric", minute: "2-digit",
          })}
        </span>
        , your time.
      </p>

      {error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--danger)" }}>{error}</p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", flexWrap: "wrap" }}>
        <button
          onClick={save}
          disabled={busy}
          className="press"
          style={{
            minHeight: 40, padding: "0 18px", borderRadius: "var(--r-full)", border: "none",
            background: "var(--gold)", color: "var(--gold-ink)",
            fontSize: "var(--t-secondary)", fontWeight: 600, cursor: "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Saving…" : existing ? "Save changes" : "Create club night"}
        </button>
        {existing && (
          <button
            onClick={stop}
            disabled={busy}
            className="press"
            style={{
              minHeight: 40, padding: "0 14px", borderRadius: "var(--r-full)", marginLeft: "auto",
              background: "transparent", border: "1px solid var(--border)",
              color: "var(--text-muted)", fontSize: "var(--t-secondary)", fontWeight: 600, cursor: "pointer",
            }}
          >
            Stop weekly night
          </button>
        )}
      </div>
    </div>
  );
}

const select: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 var(--s2)",
  borderRadius: "var(--r-md)",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontSize: 16, // 16px, or iOS zooms the page on focus
};
