import type { Config } from "tailwindcss";

// GLYPH — "The Board at Midnight"
// Every colour here points at a CSS variable in globals.css, so a
// Tailwind class and an inline style resolve to the same token and a
// theme switch moves both at once. Nothing in this file is a literal.
export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: {
          DEFAULT: "var(--bg)",
          raised: "var(--surface)",
          card: "var(--surface-2)",
        },
        gold: {
          DEFAULT: "var(--gold)",
          hover: "var(--gold-hover)",
          wash: "var(--gold-wash)",
          ink: "var(--gold-ink)",
        },
        ivory: {
          DEFAULT: "var(--text)",
          meta: "var(--text-muted)",
          dim: "var(--text-dim)",
        },
        winc: "var(--success)",
        lossc: "var(--danger)",
        drawc: "var(--draw)",
      },
      borderColor: {
        edge: "var(--border-gold)",
        line: "var(--border)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "Times New Roman", "serif"],
        body: ["var(--font-body)", "-apple-system", "Segoe UI", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "-apple-system", "Segoe UI", "system-ui", "sans-serif"],
      },
      fontSize: {
        // The scale by role — what new work should use.
        caption: ["var(--t-caption)", { lineHeight: "var(--lh-caption)" }],
        secondary: ["var(--t-secondary)", { lineHeight: "var(--lh-secondary)" }],
        body: ["var(--t-body)", { lineHeight: "var(--lh-body)" }],
        h2: ["var(--t-h2)", { lineHeight: "var(--lh-h2)" }],
        h1: ["var(--t-h1)", { lineHeight: "var(--lh-h1)" }],
        display: ["var(--t-display)", { lineHeight: "var(--lh-display)" }],

        // The t-shirt names the existing components already use, pinned
        // to the same scale so nothing silently resizes mid-migration.
        xs: ["13px", { lineHeight: "1.4" }],
        sm: ["14px", { lineHeight: "1.5" }],
        base: ["16px", { lineHeight: "1.55" }],
        lg: ["20px", { lineHeight: "1.25" }],
        xl: ["24px", { lineHeight: "1.2" }],
        "2xl": ["30px", { lineHeight: "1.15" }],
        "3xl": ["40px", { lineHeight: "1.1" }],
      },
      spacing: {
        1: "var(--s1)",
        2: "var(--s2)",
        3: "var(--s3)",
        4: "var(--s4)",
        5: "var(--s5)",
        6: "var(--s6)",
        8: "var(--s8)",
        10: "var(--s10)",
        12: "var(--s12)",
        16: "var(--s16)",
        tap: "var(--tap)",
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
      },
    },
  },
  plugins: [],
} satisfies Config;
