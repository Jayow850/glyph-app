"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  CATEGORY_ICON,
  presetsFor,
  classify,
  parseId,
  type SpeedCategory,
} from "@engine/game/timeControls";

const GOLD = "var(--gold)";
const RAISED = "var(--surface)";
const SUNK = "var(--bg)";

interface Player {
  id: string;
  handle: string;
  fullName: string;
  country: string | null;
  rating: string;
  /** Why this person is on the list — "Your club", "Played recently", … */
  reason: string;
}

function Segment({
  options, value, onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", background: SUNK, borderRadius: 10, padding: 3, gap: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1, border: "none", borderRadius: 8, padding: "8px 4px",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
              background: on ? GOLD : "transparent",
              color: on ? "var(--gold-ink)" : "var(--text-muted)",
              transition: "background 140ms, color 140ms",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ChallengeBuilder({ defaultPresetId = "600+0" }: { defaultPresetId?: string }) {
  const initialCategory = useMemo(() => {
    const { base, increment } = parseId(defaultPresetId);
    return classify(base, increment);
  }, [defaultPresetId]);

  const [category, setCategory] = useState<SpeedCategory>(initialCategory);
  const [presetId, setPresetId] = useState(defaultPresetId);
  const [rated, setRated] = useState(true);
  const [colour, setColour] = useState<"random" | "white" | "black">("random");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [opponent, setOpponent] = useState<Player | null>(null);
  const [searching, setSearching] = useState(false);
  const [suggested, setSuggested] = useState(true);

  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const presets = presetsFor(category);

  // Keep the chosen clock inside the chosen speed.
  useEffect(() => {
    if (!presets.some((p) => p.id === presetId) && presets[0]) {
      setPresetId(presets[0].id);
    }
  }, [category, presets, presetId]);

  // Opponent list. An empty box is not an empty screen — with no query
  // the server answers with people worth playing, so there is always
  // somebody to tap.
  useEffect(() => {
    if (opponent) return;
    const q = query.trim();

    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}&category=${category}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) {
          setResults(data.players ?? []);
          setSuggested(Boolean(data.suggested));
        }
      } catch {
        /* leave the previous list up */
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, q.length === 0 ? 0 : 220);

    return () => { cancelled = true; clearTimeout(t); };
  }, [query, category, opponent]);

  async function send() {
    if (!opponent || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toId: opponent.id,
          timeControl: presetId,
          color: colour,
          rated,
          message: note.trim() || undefined,
        }),
      });
      if (res.ok) {
        setSent(opponent.fullName);
        setOpponent(null);
        setQuery("");
        setNote("");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error === "cannot_challenge_yourself" ? "Pick someone else."
          : data.error === "no_such_player" ? "That player is no longer available."
          : "The challenge didn't send.",
        );
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <h2 className="font-display t-h2">New challenge</h2>

      {/* Speed */}
      <div style={{ display: "flex", gap: 6 }}>
        {CATEGORY_ORDER.map((c) => {
          const on = c === category;
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              style={{
                flex: 1, border: `1px solid ${on ? "rgba(212,175,55,0.45)" : "rgba(255,255,255,0.07)"}`,
                background: on ? "rgba(212,175,55,0.14)" : SUNK,
                color: on ? GOLD : "var(--text-muted)",
                borderRadius: 10, padding: "9px 2px", cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>{CATEGORY_ICON[c]}</span>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{CATEGORY_LABEL[c]}</span>
            </button>
          );
        })}
      </div>

      {/* Clock */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8 }}>
        {presets.map((p) => {
          const on = p.id === presetId;
          return (
            <button
              key={p.id}
              onClick={() => setPresetId(p.id)}
              className="digits"
              style={{
                border: `1px solid ${on ? GOLD : "rgba(255,255,255,0.08)"}`,
                background: on ? "rgba(212,175,55,0.16)" : RAISED,
                color: on ? "var(--text)" : "var(--text-muted)",
                borderRadius: 12, padding: "16px 4px",
                fontSize: 17, fontWeight: 600, cursor: "pointer",
                transition: "border-color 140ms, background 140ms",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <p className="section-label" style={{ marginBottom: 6 }}>Stakes</p>
          <Segment
            value={rated ? "rated" : "casual"}
            onChange={(v) => setRated(v === "rated")}
            options={[{ value: "rated", label: "Rated" }, { value: "casual", label: "Casual" }]}
          />
        </div>
        <div>
          <p className="section-label" style={{ marginBottom: 6 }}>You play</p>
          <Segment
            value={colour}
            onChange={(v) => setColour(v as "random" | "white" | "black")}
            options={[
              { value: "random", label: "Random" },
              { value: "white", label: "White" },
              { value: "black", label: "Black" },
            ]}
          />
        </div>
      </div>

      {/* Opponent */}
      <div>
        <p className="section-label" style={{ marginBottom: 6 }}>Opponent</p>

        {opponent ? (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10,
              background: SUNK, border: `1px solid ${GOLD}`,
              borderRadius: 10, padding: "10px 12px",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 600 }}>{opponent.fullName}</p>
              <p className="text-ivory-meta digits" style={{ fontSize: 12 }}>
                @{opponent.handle} · {opponent.rating}
              </p>
            </div>
            <button
              onClick={() => { setOpponent(null); setQuery(""); }}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or @handle"
              style={{
                width: "100%", boxSizing: "border-box", background: SUNK, color: "var(--text)",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
                padding: "11px 12px", fontSize: 15, outline: "none",
              }}
            />

            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {suggested && results.length > 0 && (
                <p className="section-label" style={{ marginBottom: 2 }}>Players you can challenge</p>
              )}
              {searching && results.length === 0 && (
                <p className="text-ivory-meta" style={{ fontSize: 13 }}>Looking…</p>
              )}
              {!searching && results.length === 0 && (
                <p className="text-ivory-meta" style={{ fontSize: 13 }}>
                  {suggested ? "Nobody else here yet." : "Nobody by that name."}
                </p>
              )}
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setOpponent(p); setResults([]); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    background: RAISED, border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 10, padding: "9px 11px", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                      display: "grid", placeItems: "center", background: "var(--border)",
                      color: "var(--text-muted)", fontSize: 12, fontWeight: 600,
                    }}
                  >
                    {p.fullName.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.fullName}
                    </p>
                    <p className="text-ivory-meta" style={{ fontSize: 12 }}>
                      @{p.handle}{p.reason ? ` · ${p.reason}` : ""}
                    </p>
                  </div>
                  <span className="digits" style={{ fontSize: 14, color: GOLD, fontWeight: 600 }}>{p.rating}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {opponent && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={140}
          placeholder="Add a note (optional)"
          style={{
            width: "100%", boxSizing: "border-box", background: SUNK, color: "var(--text)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
            padding: "10px 12px", fontSize: 14, outline: "none",
          }}
        />
      )}

      {error && <p style={{ fontSize: 14, color: "var(--danger)" }}>{error}</p>}
      {sent && <p style={{ fontSize: 14, color: GOLD }}>Challenge sent to {sent}.</p>}

      <button
        onClick={send}
        disabled={!opponent || sending}
        style={{
          border: "none", borderRadius: 12, padding: "13px 0",
          fontSize: 15, fontWeight: 600,
          background: opponent ? GOLD : "var(--surface-2)",
          color: opponent ? "var(--gold-ink)" : "var(--text-dim)",
          cursor: opponent && !sending ? "pointer" : "default",
          opacity: sending ? 0.5 : 1,
        }}
      >
        {sending ? "Sending…" : opponent ? `Challenge ${opponent.fullName}` : "Pick an opponent"}
      </button>
    </section>
  );
}
