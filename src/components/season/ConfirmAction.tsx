"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/**
 * A two-step action: show exactly what will happen, then do it.
 *
 * Used for closing a half and closing a season. Both are irreversible
 * and both are socially charged — relegation is a conversation at the
 * club on Wednesday night, not a row that quietly changed. An
 * organiser who taps the wrong thing should see the consequence before
 * it becomes true, not after.
 */
export function ConfirmAction({
  label,
  previewUrl,
  commitUrl,
  heading,
  confirmLabel,
  danger = false,
  renderPreview,
}: {
  label: string;
  previewUrl: string;
  commitUrl: string;
  heading: string;
  confirmLabel: string;
  danger?: boolean;
  /** Turn the preview payload into lines the organiser can read. */
  renderPreview: (data: unknown) => { lines: string[]; warning?: string };
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ lines: string[]; warning?: string } | null>(null);
  const router = useRouter();

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(previewUrl, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "failed");
      setPreview(renderPreview(await res.json()));
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not work out what would happen.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(commitUrl, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "failed");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div>
        <button onClick={load} disabled={busy} className="press" style={ghost(danger)}>
          {busy ? "Checking…" : label}
        </button>
        {error && (
          <p className="t-caption" role="alert" style={{ color: "var(--danger)", marginTop: 6 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1px solid ${danger ? "var(--danger)" : "var(--border-gold)"}`,
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", padding: "var(--s3) var(--s4)" }}>
        <p className="t-row" style={{ flex: 1 }}>{heading}</p>
        <button
          onClick={() => { setOpen(false); setPreview(null); }}
          aria-label="Cancel"
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

      {preview?.warning && (
        <p
          className="t-rowmeta"
          style={{
            padding: "var(--s2) var(--s4)", borderTop: "1px solid var(--border)",
            color: "var(--gold)",
          }}
        >
          {preview.warning}
        </p>
      )}

      <div style={{ borderTop: "1px solid var(--border)", padding: "var(--s3) var(--s4)" }}>
        {preview && preview.lines.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {preview.lines.map((l, i) => (
              <li key={i} className="t-secondary" style={{ color: "var(--text)" }}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="t-rowmeta">Nothing would change.</p>
        )}
      </div>

      {error && (
        <p
          className="t-secondary"
          role="alert"
          style={{ padding: "0 var(--s4) var(--s2)", color: "var(--danger)" }}
        >
          {error}
        </p>
      )}

      <div
        style={{
          display: "flex", alignItems: "center", gap: "var(--s2)",
          padding: "var(--s3) var(--s4)", borderTop: "1px solid var(--border)",
        }}
      >
        <button
          onClick={commit}
          disabled={busy}
          className="press"
          style={{
            minHeight: 40, padding: "0 18px", borderRadius: "var(--r-full)", border: "none",
            background: danger ? "var(--danger)" : "var(--gold)",
            color: danger ? "var(--bg)" : "var(--gold-ink)",
            fontSize: "var(--t-secondary)", fontWeight: 600, cursor: "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
        <button
          onClick={() => { setOpen(false); setPreview(null); }}
          disabled={busy}
          className="press"
          style={{ ...ghost(false), marginLeft: "auto" }}
        >
          Not yet
        </button>
      </div>
    </div>
  );
}

function ghost(danger: boolean): React.CSSProperties {
  return {
    minHeight: 38,
    padding: "0 14px",
    borderRadius: "var(--r-full)",
    background: "transparent",
    border: `1px solid ${danger ? "var(--danger)" : "var(--border)"}`,
    color: danger ? "var(--danger)" : "var(--text-muted)",
    fontSize: "var(--t-secondary)",
    fontWeight: 600,
    cursor: "pointer",
  };
}
