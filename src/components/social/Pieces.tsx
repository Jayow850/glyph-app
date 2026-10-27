/**
 * GLYPH piece set.
 *
 * Not an imitation of a Staunton set — these are carved geometric forms,
 * built from arcs and facets so they stay legible at 24px on a phone and
 * still look deliberate at 90px on a desktop board. The name of the
 * product is a carved symbol; the pieces should read like one.
 *
 * Every piece is drawn in a 45×45 box on a shared plinth so the set has
 * one eye level and one visual weight across the board.
 */

const WHITE_FILL = "#F7F4EC";
const WHITE_LINE = "#1A1A1E";
const BLACK_FILL = "#242429";
const BLACK_LINE = "#08080A";

/** Base + collar, shared by every piece so they sit on one line. */
function Plinth({ collar = true }: { collar?: boolean }) {
  return (
    <>
      {collar && <rect x="11.5" y="32.6" width="22" height="4.3" rx="1.7" />}
      <rect x="9" y="36.6" width="27" height="4.6" rx="2" />
    </>
  );
}

const SHAPES: Record<string, React.ReactNode> = {
  p: (
    <>
      <circle cx="22.5" cy="13.2" r="5.1" />
      <path d="M17.2 18.4h10.6l1.9 3.3H15.3z" />
      <path d="M18.9 21.7c-.5 5.3-2.8 9.3-5.4 12.6h18c-2.6-3.3-4.9-7.3-5.4-12.6z" />
      <rect x="9" y="36.6" width="27" height="4.6" rx="2" />
    </>
  ),

  r: (
    <>
      <path d="M12.5 11.2h4.2v3.1h3.7v-3.1h4.2v3.1h3.7v-3.1h4.2v8.1L30 21.4v11.2l3.4 2.8H11.6l3.4-2.8V21.4l-2.5-2.1z" />
      <path d="M15 21.4h15" strokeWidth="1.1" />
      <Plinth collar={false} />
    </>
  ),

  n: (
    <>
      <path d="M33.4 35.4c.3-10.4-.6-18.3-4.6-23.1l1.2-4.7-3.8 2.3c-3-2-6.7-1.3-9.8 1.6-3.2 3-5.5 6.7-6.1 9.8-.3 1.7 1.3 2.4 2.7 1.3l2.9-2.3c-1.2 2.6-1.9 4.8-2 6.8-.1 3.4-1.6 6.3-3.3 8.3z" />
      <circle cx="26" cy="14.6" r="1.25" stroke="none" />
      <path d="M28.6 17.8c1.6 2.6 2.4 6.2 2.6 10.4" strokeWidth="1.1" fill="none" />
      <Plinth collar={false} />
    </>
  ),

  b: (
    <>
      <circle cx="22.5" cy="7.2" r="2.3" />
      <path d="M22.5 9.3c4.1 3.2 6.5 7.6 6.5 11.9 0 3.2-1.5 5.7-3.4 7.4h-6.2c-1.9-1.7-3.4-4.2-3.4-7.4 0-4.3 2.4-8.7 6.5-11.9z" />
      <path d="M22.5 13.6v7.6M19 17.4h7" strokeWidth="1.5" fill="none" />
      <path d="M16.4 28.4h12.2l1.6 3.4H14.8z" />
      <Plinth />
    </>
  ),

  q: (
    <>
      <path d="M10 14.6l3.6 14.1h17.8L35 14.6l-4 4.3-2.6-8.9-2.9 7.2-2.9-9.1-3 9.1-2.9-7.2L14 18.9z" />
      <circle cx="10" cy="13.4" r="2.3" />
      <circle cx="16.6" cy="9.6" r="2.3" />
      <circle cx="22.5" cy="7.8" r="2.5" />
      <circle cx="28.4" cy="9.6" r="2.3" />
      <circle cx="35" cy="13.4" r="2.3" />
      <path d="M13.9 28.5h17.2l1.7 3.5H12.2z" />
      <Plinth />
    </>
  ),

  k: (
    <>
      <path d="M22.5 5.6v8.2M19.1 8.6h6.8" strokeWidth="2.3" fill="none" strokeLinecap="round" />
      <path d="M22.5 14.2c3.3-3.9 9.4-2.4 9.4 2.9 0 3.2-2.3 5.4-4.3 7.4l-.9 4.2h-8.4l-.9-4.2c-2-2-4.3-4.2-4.3-7.4 0-5.3 6.1-6.8 9.4-2.9z" />
      <path d="M18.2 24.5c2.9-1.5 5.7-1.5 8.6 0" strokeWidth="1.1" fill="none" />
      <path d="M13.9 28.5h17.2l1.7 3.5H12.2z" />
      <Plinth />
    </>
  ),
};

export function Piece({ code }: { code: string }) {
  const white = code === code.toUpperCase();
  const shape = SHAPES[code.toLowerCase()];
  if (!shape) return null;

  return (
    <svg
      viewBox="0 0 45 45"
      width="88%"
      height="88%"
      aria-hidden="true"
      style={{
        display: "block",
        filter: white
          ? "drop-shadow(0 1.5px 1.5px rgba(0,0,0,0.38))"
          : "drop-shadow(0 1.5px 1.5px rgba(0,0,0,0.3))",
      }}
    >
      <g
        fill={white ? WHITE_FILL : BLACK_FILL}
        stroke={white ? WHITE_LINE : BLACK_LINE}
        strokeWidth={1.3}
        strokeLinejoin="round"
      >
        {shape}
      </g>
    </svg>
  );
}

/** Flat silhouette for captured-material strips — no outline, no shadow. */
export function PieceMark({ code, size = 15 }: { code: string; size?: number }) {
  const shape = SHAPES[code.toLowerCase()];
  if (!shape) return null;
  return (
    <svg viewBox="0 0 45 45" width={size} height={size} aria-hidden="true" style={{ display: "block" }}>
      <g fill="#6E6E78" stroke="#6E6E78" strokeWidth={1.3} strokeLinejoin="round">
        {shape}
      </g>
    </svg>
  );
}
