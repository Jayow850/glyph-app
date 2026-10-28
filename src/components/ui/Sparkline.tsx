/**
 * A rating over time, drawn small.
 *
 * Every rated game already writes a GlyphRatingHistory row — before,
 * after, delta, opponent, result — and nothing has ever read them.
 * This is the cheapest useful thing to do with that: not an analysis
 * tool, just the shape of the last few weeks, which is the question a
 * player actually has when they open their own profile.
 *
 * Pure SVG on purpose. A chart library for one polyline is several
 * hundred kilobytes to draw thirty points.
 */
export function Sparkline({
  points,
  width = 96,
  height = 28,
  stroke = "var(--gold)",
}: {
  /** Oldest first. Fewer than two and nothing is drawn. */
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  // A flat run has no range to scale by, so give it one and let the
  // line sit in the middle rather than dividing by zero.
  const span = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (points.length - 1);

  const path = points
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const rising = points[points.length - 1] >= points[0];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      fill="none"
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
    >
      <path
        d={path}
        stroke={rising ? stroke : "var(--danger)"}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={pad + (points.length - 1) * stepX}
        cy={pad + (1 - (points[points.length - 1] - min) / span) * (height - pad * 2)}
        r={2.2}
        fill={rising ? stroke : "var(--danger)"}
      />
    </svg>
  );
}
