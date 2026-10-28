/**
 * The reaction set, drawn rather than typed.
 *
 * Emoji were the obvious choice and the wrong one: 🔥 and 👏 render as
 * a different picture on every platform, carry no chess meaning, and
 * are exactly what makes a product look assembled from defaults. These
 * four are chess annotation marks — the language players already use
 * on a scoresheet — so the rail speaks the game's own shorthand.
 *
 * One set, used on the rail and on feed posts, so a reaction means the
 * same thing everywhere in GLYPH.
 */

export type RailKind = "BRILLIANT" | "BLUNDER" | "NICE" | "RESPECT";

export const RAIL_LABEL: Record<RailKind, string> = {
  BRILLIANT: "Brilliant",
  BLUNDER: "Blunder",
  NICE: "Nice",
  RESPECT: "Respect",
};

export const RAIL_COLOR: Record<RailKind, string> = {
  BRILLIANT: "var(--gold)",
  BLUNDER: "var(--danger)",
  NICE: "var(--success)",
  RESPECT: "var(--draw)",
};

export const RAIL_ORDER: RailKind[] = ["BRILLIANT", "NICE", "BLUNDER", "RESPECT"];

/** "!!" — the mark for a brilliancy. */
const BRILLIANT = (
  <text x="12" y="17" textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor" stroke="none">!!</text>
);

/** "??" — the mark for a blunder. */
const BLUNDER = (
  <text x="12" y="17" textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor" stroke="none">??</text>
);

/** "!" — a good move. */
const NICE = (
  <text x="12" y="17.5" textAnchor="middle" fontSize="16" fontWeight="700" fill="currentColor" stroke="none">!</text>
);

/** A pawn — the old way of saying "well played" across a board. */
const RESPECT = (
  <>
    <circle cx="12" cy="6.6" r="2.7" />
    <path d="M9.4 9.6 7.9 15h8.2l-1.5-5.4" />
    <path d="M6.6 18.6h10.8" />
  </>
);

const SHAPE: Record<RailKind, React.ReactNode> = {
  BRILLIANT, BLUNDER, NICE, RESPECT,
};

export function RailMark({ kind, size = 18 }: { kind: RailKind; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      {SHAPE[kind]}
    </svg>
  );
}
