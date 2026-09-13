import { RatingBadge } from "./RatingDelta";

export interface PairingRow {
  boardNumber: number;
  white: { name: string; rating: number };
  black: { name: string; rating: number } | null; // null = bye
  result: string;
}

const RESULT_LABEL: Record<string, string> = {
  WHITE_WIN: "1–0", BLACK_WIN: "0–1", DRAW: "½–½",
  WHITE_FORFEIT: "0–1F", BLACK_FORFEIT: "1–0F",
  BYE_FULL: "bye 1", BYE_HALF: "bye ½", PENDING: "·",
};

export function PairingsTable({ rows, roundNumber }: { rows: PairingRow[]; roundNumber: number }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-baseline justify-between border-b border-board-line px-4 py-3">
        <h2 className="font-display text-lg">Round {roundNumber}</h2>
        <span className="font-score text-xs text-ivory-dim">{rows.length} boards</span>
      </header>
      <ul>
        {rows.map((r) => (
          <li key={r.boardNumber} className="flex items-center gap-3 border-b border-board-line px-4 py-3 last:border-0">
            <span className="board-chip">B{r.boardNumber}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate">{r.white.name} <RatingBadge rating={r.white.rating} /></p>
              <p className="truncate text-ivory-dim">
                {r.black ? <>{r.black.name} <RatingBadge rating={r.black.rating} /></> : "— bye —"}
              </p>
            </div>
            <span className="font-score text-sm">{RESULT_LABEL[r.result] ?? r.result}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
