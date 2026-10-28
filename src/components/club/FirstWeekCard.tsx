"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export interface FirstWeekProps {
  clubSlug: string;
  clubName: string;
  day: number;
  pickedTimeControl: boolean;
  playedClubGame: boolean;
  metMembers: boolean;
  done: boolean;
}

/**
 * The first week, as three things to actually do.
 *
 * It disappears for good once complete or dismissed, and it never
 * reappears to nag. A card that keeps coming back after you have
 * decided you do not want it is the thing people learn to resent, and
 * the resentment attaches to the club.
 *
 * Dismissal is per device rather than per account on purpose: it is a
 * UI preference, not a fact about the member, and it is not worth a
 * column or a round trip.
 */
export function FirstWeekCard({
  clubSlug, clubName, day, pickedTimeControl, playedClubGame, metMembers, done,
}: FirstWeekProps) {
  const [hidden, setHidden] = useState(true);
  const key = `glyph-firstweek-${clubSlug}`;

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(key) === "1");
    } catch {
      setHidden(false);
    }
  }, [key]);

  function dismiss() {
    setHidden(true);
    try { localStorage.setItem(key, "1"); } catch { /* blocked */ }
  }

  if (hidden || done) return null;

  const steps = [
    { done: pickedTimeControl, label: "Pick your time control", href: "/challenges" },
    { done: playedClubGame, label: `Play your first ${clubName} game`, href: "/challenges" },
    { done: metMembers, label: "Meet three members near your rating", href: `/club/${clubSlug}` },
  ];
  const left = steps.filter((s) => !s.done).length;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-gold)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)", padding: "var(--s3) var(--s4)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="t-row">Your first week</p>
          <p className="t-rowmeta">
            Day <span className="digits">{day}</span> · <span className="digits">{left}</span>{" "}
            {left === 1 ? "thing" : "things"} left
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="press"
          style={{
            flexShrink: 0, width: 32, height: 32, borderRadius: "var(--r-md)",
            display: "grid", placeItems: "center", cursor: "pointer",
            background: "transparent", border: "none", color: "var(--text-dim)",
          }}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {steps.map((s, i) => (
        <Link
          key={i}
          href={s.href}
          className="press"
          style={{
            display: "flex", alignItems: "center", gap: "var(--s3)",
            padding: "var(--s3) var(--s4)", minHeight: 48,
            borderTop: "1px solid var(--border)",
            textDecoration: "none", color: "inherit",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
              display: "grid", placeItems: "center",
              background: s.done ? "var(--success)" : "transparent",
              border: s.done ? "none" : "1.5px solid var(--border)",
              color: "var(--bg)",
            }}
          >
            {s.done && <Icon name="check" size={12} strokeWidth={3} />}
          </span>
          <span
            className="t-secondary"
            style={{
              flex: 1, color: s.done ? "var(--text-dim)" : "var(--text)",
              textDecoration: s.done ? "line-through" : "none",
            }}
          >
            {s.label}
          </span>
          {!s.done && <Icon name="chevronRight" size={16} />}
        </Link>
      ))}
    </div>
  );
}
