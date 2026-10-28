"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Bottom sheet. Covers most of the screen, dismisses on backdrop tap or
 * Escape, and locks the page behind it so the list doesn't scroll the
 * page underneath — the thing that makes a web sheet feel unlike an app.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  large = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** A muted line under the title, inside the same padded header. */
  subtitle?: React.ReactNode;
  /** Display-size title, for a sheet that is the moment rather than a menu. */
  large?: boolean;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // Move focus in, so a keyboard or screen reader lands inside the sheet.
    panel.current?.focus();

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
      }}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        style={{
          position: "absolute", inset: 0, border: "none", padding: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(2px)",
          animation: "sheet-fade 180ms var(--ease) both",
          cursor: "default",
        }}
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          position: "relative",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          borderTopLeftRadius: "var(--r-xl)",
          borderTopRightRadius: "var(--r-xl)",
          maxHeight: "86vh",
          display: "flex",
          flexDirection: "column",
          animation: "sheet-up 220ms var(--ease) both",
          outline: "none",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div style={{ display: "grid", placeItems: "center", paddingTop: "var(--s2)" }}>
          <span style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)" }} />
        </div>

        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "var(--s3) var(--s4) var(--s2)",
          }}
        >
          {/* The title lives in the header, which owns the padding. A
              caller drawing its own heading in the scroll body ends up
              underneath the drag handle — which is exactly what happened. */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2
              className="font-display"
              style={{
                fontSize: large ? "var(--t-display)" : "var(--t-h2)",
                lineHeight: 1.15,
                letterSpacing: large ? "-0.02em" : undefined,
              }}
            >
              {title}
            </h2>
            {subtitle && <p className="t-secondary" style={{ marginTop: 2 }}>{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="tap press"
            style={{
              background: "transparent", border: "none", color: "var(--text-muted)",
              display: "grid", placeItems: "center", cursor: "pointer",
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "0 var(--s4) var(--s4)", flex: 1 }}>
          {children}
        </div>
      </div>

      <style>{`
        @keyframes sheet-up { from { transform: translateY(14px); opacity: 0.6 } to { transform: none; opacity: 1 } }
        @keyframes sheet-fade { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>
  );
}
