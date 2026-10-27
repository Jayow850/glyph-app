export interface StandingRow {
  rank: number;
  name: string;
  score: number;
  buchholz: number;
  sb: number;
}

/** Gold for the podium, ivory for everyone still climbing. */
function rankColor(rank: number) {
  return rank <= 3 ? "#D4AF37" : "#8A8A93";
}

export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="card">
        <p className="text-ivory-meta" style={{ fontSize: 14 }}>No results yet.</p>
      </section>
    );
  }

  return (
    <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(212,175,55,0.08)" }}>
            <th className="section-label" style={{ textAlign: "left", padding: "12px 20px" }}>#</th>
            <th className="section-label" style={{ textAlign: "left", padding: "12px 0" }}>Player</th>
            <th className="section-label" style={{ textAlign: "right", padding: "12px 0" }}>Pts</th>
            <th className="section-label" style={{ textAlign: "right", padding: "12px 0" }}>Buch</th>
            <th className="section-label" style={{ textAlign: "right", padding: "12px 20px" }}>SB</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.rank}
              style={{ borderBottom: i === rows.length - 1 ? "none" : "1px solid rgba(255,255,255,0.05)" }}
            >
              <td className="digits" style={{ padding: "11px 20px", fontSize: 14, fontWeight: 600, color: rankColor(r.rank) }}>
                {r.rank}
              </td>
              <td style={{ padding: "11px 0", fontSize: 15 }}>{r.name}</td>
              <td className="digits" style={{ padding: "11px 0", fontSize: 15, fontWeight: 600, textAlign: "right" }}>
                {r.score.toFixed(1)}
              </td>
              <td className="digits text-ivory-meta" style={{ padding: "11px 0", fontSize: 14, textAlign: "right" }}>
                {r.buchholz.toFixed(1)}
              </td>
              <td className="digits text-ivory-meta" style={{ padding: "11px 20px", fontSize: 14, textAlign: "right" }}>
                {r.sb.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
