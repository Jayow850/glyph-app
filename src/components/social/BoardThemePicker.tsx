"use client";

import { useEffect, useState } from "react";
import { BOARD_THEMES, DEFAULT_THEME, THEME_STORAGE_KEY, applyBoardTheme } from "./boardThemes";

/** Four swatches. Click one, the board changes and remembers. */
export function BoardThemePicker() {
  const [active, setActive] = useState(DEFAULT_THEME.id);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      const theme = BOARD_THEMES.find((t) => t.id === saved);
      if (theme) {
        applyBoardTheme(theme);
        setActive(theme.id);
      }
    } catch {
      /* private browsing, blocked storage — the default board is fine */
    }
  }, []);

  function choose(id: string) {
    const theme = BOARD_THEMES.find((t) => t.id === id);
    if (!theme) return;
    applyBoardTheme(theme);
    setActive(id);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      /* the choice still applies for this session */
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {BOARD_THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => choose(t.id)}
          title={t.name}
          aria-label={`${t.name} board`}
          aria-pressed={active === t.id}
          style={{
            width: 26,
            height: 26,
            padding: 0,
            borderRadius: 7,
            cursor: "pointer",
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            border: active === t.id ? "2px solid var(--gold)" : "1px solid var(--border)",
          }}
        >
          <span style={{ background: t.light }} />
          <span style={{ background: t.dark }} />
          <span style={{ background: t.dark }} />
          <span style={{ background: t.light }} />
        </button>
      ))}
    </div>
  );
}
