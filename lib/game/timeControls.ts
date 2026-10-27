// ============================================================
// Time controls.
//
// A game's speed is not its clock time — a 3+2 game lasts longer than a
// 5+0 one. Both Chess.com and Lichess settle this the same way: estimate
// the game at `base + 40 × increment` seconds, because a typical game
// runs about forty moves, then bucket that estimate.
//
// Thresholds follow Lichess, which publishes them exactly.
// ============================================================

export type SpeedCategory = "BULLET" | "BLITZ" | "RAPID" | "CLASSICAL";

export interface TimeControlPreset {
  /** Canonical wire format: "<base seconds>+<increment seconds>". */
  id: string;
  base: number;
  increment: number;
  label: string;
  category: SpeedCategory;
}

export function estimatedDurationSec(base: number, increment: number): number {
  return base + 40 * increment;
}

export function classify(base: number, increment: number): SpeedCategory {
  const d = estimatedDurationSec(base, increment);
  if (d <= 179) return "BULLET";
  if (d <= 479) return "BLITZ";
  if (d <= 1499) return "RAPID";
  return "CLASSICAL";
}

/** "900+10" → { base: 900, increment: 10 } */
export function parseId(id: string): { base: number; increment: number } {
  const [b, i] = (id ?? "").split("+");
  const base = Number(b);
  const increment = Number(i);
  return {
    base: Number.isFinite(base) && base > 0 ? base : 600,
    increment: Number.isFinite(increment) && increment >= 0 ? increment : 0,
  };
}

/** A clock with no increment reads "10 min"; with one it reads "10 | 5". */
export function label(base: number, increment: number): string {
  const mins = base / 60;
  const pretty = Number.isInteger(mins) ? `${mins}` : `${Math.round(base)}s`;
  return increment === 0
    ? `${pretty} min`
    : `${pretty} | ${increment}`;
}

function preset(base: number, increment: number): TimeControlPreset {
  return {
    id: `${base}+${increment}`,
    base,
    increment,
    label: label(base, increment),
    category: classify(base, increment),
  };
}

export const PRESETS: TimeControlPreset[] = [
  preset(60, 0),
  preset(60, 1),
  preset(120, 1),

  preset(180, 0),
  preset(180, 2),
  preset(300, 0),
  preset(300, 3),

  preset(600, 0),
  preset(600, 5),
  preset(900, 10),

  preset(1800, 0),
  preset(1800, 20),
];

export const CATEGORY_ORDER: SpeedCategory[] = ["BULLET", "BLITZ", "RAPID", "CLASSICAL"];

export const CATEGORY_LABEL: Record<SpeedCategory, string> = {
  BULLET: "Bullet",
  BLITZ: "Blitz",
  RAPID: "Rapid",
  CLASSICAL: "Classical",
};

/** A glyph for each speed — used on chips, ratings and result cards. */
export const CATEGORY_ICON: Record<SpeedCategory, string> = {
  BULLET: "⦿",
  BLITZ: "⚡",
  RAPID: "⏱",
  CLASSICAL: "♖",
};

export function presetsFor(category: SpeedCategory): TimeControlPreset[] {
  return PRESETS.filter((p) => p.category === category);
}

export const DEFAULT_PRESET_ID = "600+0";

/**
 * Tournaments write their clock the way arbiters say it out loud —
 * "15+10" meaning fifteen minutes plus ten seconds. Live games store
 * seconds. Translate, and fall back to something sane for the speed
 * when an organiser has typed something we don't recognise.
 */
export function fromMinuteSpec(
  spec: string | null | undefined,
  category: SpeedCategory,
): string {
  const withIncrement = /^\s*(\d{1,3})\s*\+\s*(\d{1,3})\s*$/.exec(spec ?? "");
  if (withIncrement) return `${Number(withIncrement[1]) * 60}+${Number(withIncrement[2])}`;

  const plain = /^\s*(\d{1,3})\s*$/.exec(spec ?? "");
  if (plain) return `${Number(plain[1]) * 60}+0`;

  switch (category) {
    case "BULLET": return "60+0";
    case "BLITZ": return "180+2";
    case "CLASSICAL": return "1800+0";
    default: return "600+0";
  }
}
