/** Signature element: rating change rendered like scoresheet notation. */
export function RatingDelta({ delta }: { delta: number }) {
  if (delta === 0) {
    return <span className="digits text-ivory-meta" style={{ fontSize: 13 }}>±0</span>;
  }
  return (
    <span
      className="digits"
      style={{ fontSize: 13, fontWeight: 600, color: delta > 0 ? "#7FB069" : "#B0575A" }}
    >
      {delta > 0 ? "+" : ""}{delta}
    </span>
  );
}

export function RatingBadge({ rating, provisional }: { rating: number; provisional?: boolean }) {
  return (
    <span className="digits" style={{ fontSize: 13, color: "#8A8A93" }}>
      {rating}
      {provisional && <sup style={{ color: "#8A8A93" }}>?</sup>}
    </span>
  );
}
