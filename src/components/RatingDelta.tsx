/** Signature element: rating change rendered like scoresheet notation. */
export function RatingDelta({ delta }: { delta: number }) {
  if (delta === 0) return <span className="delta text-ivory-dim">±0</span>;
  return (
    <span className={`delta ${delta > 0 ? "delta-up" : "delta-down"}`}>
      {delta > 0 ? "+" : ""}{delta}
    </span>
  );
}

export function RatingBadge({ rating, provisional }: { rating: number; provisional?: boolean }) {
  return (
    <span className="font-score text-sm tabular-nums text-ivory">
      {rating}{provisional && <sup className="text-ivory-dim">?</sup>}
    </span>
  );
}
