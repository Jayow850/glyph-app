"use client";

import { useState } from "react";

/**
 * A real flag, served as an SVG from /public/flags on demand — about
 * 400 bytes for the two on a game screen.
 *
 * Not emoji: Windows ships no regional-indicator glyphs, so 🇳🇬 renders
 * as two boxed letters there while looking perfect on the phone you
 * tested on. Not a bundled sprite either: external <use> is unreliable
 * in Safari, and an <img> works everywhere.
 *
 * Any country without a file falls back to its code, so adding the
 * remaining flags later is just dropping more files in that folder.
 */
export function Flag({ code, height = 13 }: { code: string; height?: number }) {
  const [missing, setMissing] = useState(false);
  const cc = code.trim().toLowerCase();
  if (!cc || cc.length !== 2) return null;

  if (missing) {
    return (
      <span
        title={code.toUpperCase()}
        style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
          padding: "1px 4px", borderRadius: 3, lineHeight: 1.4,
          background: "var(--surface-2)", color: "var(--text-muted)", flexShrink: 0,
        }}
      >
        {code.toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/flags/${cc}.svg`}
      alt={code.toUpperCase()}
      title={code.toUpperCase()}
      width={Math.round(height * 1.5)}
      height={height}
      onError={() => setMissing(true)}
      style={{
        display: "block",
        flexShrink: 0,
        borderRadius: 2,
        boxShadow: "0 0 0 1px rgba(0,0,0,0.28)",
        objectFit: "cover",
      }}
    />
  );
}
