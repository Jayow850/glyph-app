"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LadderRules as Rules } from "@/lib/services/ladder";

/**
 * The four rules, on one screen.
 *
 * This panel must never need a scrollbar. The documented reason club
 * ladders die is rule complexity, so the constraint is the design: if a
 * fifth rule ever seems necessary, the answer is almost certainly that
 * one of these four is wrong rather than that a fifth is missing.
 *
 * Every rule is written as the sentence a secretary would say out loud,
 * with the number inline, so the panel reads as the ladder's rules and
 * not as a settings form.
 */
export function LadderRules({
  clubSlug,
  rules,
  canEdit,
}: {
  clubSlug: string;
  rules: Rules;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    ladderRange: rules.range,
    ladderCooldownDays: rules.cooldownDays,
    ladderMaxPerWeek: rules.maxPerWeek,
    ladderMaxDeclines: rules.maxDeclines,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clubs/${clubSlug}/ladder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save.");
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

  const lines: [string, string, keyof typeof v, number, number][] = [
    ["Challenge up to", "rungs above you", "ladderRange", 1, 20],
    ["Wait", "days before the same pair meet again", "ladderCooldownDays", 0, 365],
    ["Nobody is challenged more than", "times a week", "ladderMaxPerWeek", 1, 20],
    ["After", "declines in a row, the next is automatic", "ladderMaxDeclines", 1, 10],
  ];

  if (!open) {
    return (
      <div
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", padding: "var(--s3) var(--s4)",
        }}
      >
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {lines.map(([before, after, key]) => (
            <li key={key} className="t-secondary" style={{ color: "var(--text-muted)" }}>
              {before} <span className="digits" style={{ color: "var(--text)", fontWeight: 600 }}>{v[key]}</span>{" "}
              {after}.
            </li>
          ))}
        </ul>
        {canEdit && (
          <button
            onClick={() => setOpen(true)}
            className="press"
            style={{
              marginTop: "var(--s3)", minHeight: 34, padding: "0 12px",
              borderRadius: "var(--r-full)", cursor: "pointer",
              background: "transparent", border: "1px solid var(--border)",
              color: "var(--text-muted)", fontSize: "var(--t-caption)", fontWeight: 600,
            }}
          >
            Change the rules
          </button>
        )}
      </div>
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
      {lines.map(([before, after, key, min, max]) => (
        <label key={key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="t-caption">{before} … {after}</span>
          <input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={v[key]}
            onChange={(e) => setV({ ...v, [key]: Number(e.target.value) })}
            style={{
              width: 92, minHeight: 44, padding: "0 var(--s2)",
              borderRadius: "var(--r-md)", background: "var(--bg)",
              border: "1px solid var(--border)", color: "var(--text)", fontSize: 16,
            }}
          />
        </label>
      ))}

      {error && <p className="t-secondary" role="alert" style={{ color: "var(--danger)" }}>{error}</p>}

      <div style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}>
        <button
          onClick={save}
          disabled={busy}
          className="press"
          style={{
            minHeight: 40, padding: "0 18px", borderRadius: "var(--r-full)", border: "none",
            background: "var(--gold)", color: "var(--gold-ink)",
            fontSize: "var(--t-secondary)", fontWeight: 600,
            cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "Saving…" : "Save the rules"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="press"
          style={{
            minHeight: 40, padding: "0 16px", borderRadius: "var(--r-full)",
            background: "transparent", border: "1px solid var(--border)",
            color: "var(--text-muted)", fontSize: "var(--t-secondary)",
            fontWeight: 600, cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
