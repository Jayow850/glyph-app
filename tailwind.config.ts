import type { Config } from "tailwindcss";

// GLYPH — "The Board at Midnight" design tokens
// Champagne gold is the color of the crown. Never pure black or white.
export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night:  { DEFAULT: "#0D0D0F", raised: "#16161A", card: "#1C1C21" },
        gold:   { DEFAULT: "#D4AF37", hover: "#E8C960" },
        ivory:  { DEFAULT: "#F5F1E8", meta: "#8A8A93" },
        winc:   { DEFAULT: "#7FB069" },
        lossc:  { DEFAULT: "#B0575A" },
        drawc:  { DEFAULT: "#9BA4B0" },
      },
      borderColor: { edge: "rgba(212,175,55,0.08)" },
      fontFamily: {
        display: ["'Fraunces'", "'Instrument Serif'", "Georgia", "serif"],
        body: ["'Inter'", "system-ui", "sans-serif"],
      },
      fontSize: {
        // spec type scale: 13/15/17/22/28/40/56
        xs: "13px", sm: "15px", base: "17px", lg: "22px", xl: "28px", "2xl": "40px", "3xl": "56px",
      },
    },
  },
  plugins: [],
} satisfies Config;
