"use client";

import { useEffect, useState } from "react";
import { apply, read, write, resolve, type ThemeChoice } from "@/lib/theme";

const SUN = (
  <>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.6v2.2M12 19.2v2.2M4.2 12H2M22 12h-2.2M6.1 6.1 4.6 4.6M19.4 19.4l-1.5-1.5M17.9 6.1l1.5-1.5M4.6 19.4l1.5-1.5" />
  </>
);

const MOON = <path d="M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8z" />;

const CHOICES: { id: ThemeChoice; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

/**
 * The palette already had a designed light mode in globals.css with no
 * way to reach it. This is the way.
 *
 * `compact` is the header button: one tap, straight to the other
 * theme, because that is the only thing anyone wants from a header.
 * The full control — including System — lives in settings.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = read();
    setChoice(saved);
    apply(saved);
    setReady(true);
  }, []);

  // Following the OS means following it as it changes, not only at load.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  function pick(next: ThemeChoice) {
    setChoice(next);
    write(next);
    apply(next);
  }

  if (compact) {
    // Rendered dark-first on the server; the icon settles on mount.
    const dark = ready ? resolve(choice) === "dark" : true;
    return (
      <button
        onClick={() => pick(dark ? "light" : "dark")}
        aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
        title={dark ? "Light theme" : "Dark theme"}
        className="tap press"
        style={{
          display: "grid", placeItems: "center", background: "transparent",
          border: "none", cursor: "pointer", color: "var(--text-muted)",
        }}
      >
        <svg
          viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor"
          strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          {dark ? SUN : MOON}
        </svg>
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      style={{
        display: "flex", gap: 2, padding: 3,
        background: "var(--surface-2)", border: "1px solid var(--border)",
        borderRadius: "var(--r-full)", width: "fit-content",
      }}
    >
      {CHOICES.map((c) => {
        const on = ready && choice === c.id;
        return (
          <button
            key={c.id}
            role="radio"
            aria-checked={on}
            onClick={() => pick(c.id)}
            className="press"
            style={{
              borderRadius: "var(--r-full)", border: "none", cursor: "pointer",
              padding: "7px 15px", fontSize: "var(--t-secondary)", fontWeight: 600,
              background: on ? "var(--gold)" : "transparent",
              color: on ? "var(--gold-ink)" : "var(--text-muted)",
              transition: "background 160ms var(--ease), color 160ms var(--ease)",
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
