export interface StandingRow {
  rank: number;
  name: string;
  score: number;
  buchholz: number;
  sb: number;
}

export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  return (
    <section className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-board-line text-left font-score text-xs text-ivory-dim">
            <th className="px-4 py-2">#</th>
            <th className="py-2">Player</th>
            <th className="py-2 text-right">Pts</th>
            <th className="py-2 text-right">Buch</th>
            <th className="px-4 py-2 text-right">SB</th>
          </tr>
        </thead>
        <tbody className="font-score tabular-nums">
          {rows.map((r) => (
            <tr key={r.rank} className="border-b border-board-line last:border-0">
              <td className="px-4 py-2 text-ivory-dim">{r.rank}</td>
              <td className="py-2 font-body">{r.name}</td>
              <td className="py-2 text-right">{r.score.toFixed(1)}</td>
              <td className="py-2 text-right text-ivory-dim">{r.buchholz.toFixed(1)}</td>
              <td className="px-4 py-2 text-right text-ivory-dim">{r.sb.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
