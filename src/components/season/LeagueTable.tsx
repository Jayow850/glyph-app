import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Flag } from "@/components/ui/Flag";
import type { LeagueRow } from "@/lib/services/league";

/**
 * The noticeboard.
 *
 * In a real club this is a sheet of paper on a wall, and members check
 * it constantly — before a game, after a game, on the way out. It has
 * to be legible at a glance and correct to the point, which is why the
 * tie-break column is shown rather than hidden: a club argues about
 * Sonneborn-Berger, and the argument should have the number in it.
 *
 * At 360px the W/D/L columns drop and the points column stays. Nothing
 * truncates; the table simply says less.
 */
export function LeagueTable({
  name,
  rows,
  youId,
  promoteCount = 0,
  relegateCount = 0,
  showMovement = false,
}: {
  name: string;
  rows: LeagueRow[];
  youId?: string | null;
  promoteCount?: number;
  relegateCount?: number;
  /** Shade the promotion and relegation places. Off until a half is live. */
  showMovement?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "var(--s5) var(--s4)",
          textAlign: "center",
        }}
      >
        <p className="t-row" style={{ marginBottom: 4 }}>{name}</p>
        <p className="t-rowmeta">Nobody allocated yet.</p>
      </div>
    );
  }

  // Clamped to the division. "Top 2 promoted. Bottom 2 relegated." in a
  // division of two says everybody goes up and everybody goes down, and
  // a member who reads that stops believing the table. A division can
  // never move more than (size - 1) in either direction, and the two
  // together can never exceed size - 1 either: somebody has to stay.
  const headroom = Math.max(0, rows.length - 1);
  const up = showMovement ? Math.min(promoteCount, headroom) : 0;
  const down = showMovement ? Math.min(relegateCount, Math.max(0, headroom - up)) : 0;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "var(--s3) var(--s4)", borderBottom: "1px solid var(--border)" }}>
        <p className="t-row">{name}</p>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 280 }}>
          <thead>
            <tr>
              <Th style={{ width: 28, textAlign: "right" }}>#</Th>
              <Th>Member</Th>
              <Th num>P</Th>
              <Th num className="league-wdl">W</Th>
              <Th num className="league-wdl">D</Th>
              <Th num className="league-wdl">L</Th>
              <Th num>Pts</Th>
              <Th num title="Sonneborn–Berger">SB</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const you = r.userId === youId;
              const promoting = i < up;
              const relegating = i >= rows.length - down && down > 0;
              return (
                <tr
                  key={r.userId}
                  style={{
                    borderTop: "1px solid var(--border)",
                    background: you ? "var(--surface-2)" : undefined,
                    boxShadow: promoting
                      ? "inset 3px 0 0 var(--success)"
                      : relegating
                        ? "inset 3px 0 0 var(--danger)"
                        : undefined,
                  }}
                >
                  <Td style={{ textAlign: "right", color: "var(--text-dim)" }}>
                    <span className="digits">{r.rank}</span>
                  </Td>
                  <Td>
                    <Link
                      href={r.handle ? `/profile/${r.handle}` : "#"}
                      style={{
                        display: "flex", alignItems: "center", gap: "var(--s2)",
                        textDecoration: "none", color: "inherit", minWidth: 0,
                      }}
                    >
                      <Avatar name={r.name} size={24} />
                      <span
                        className="t-rowmeta"
                        style={{
                          color: "var(--text)", fontWeight: you ? 700 : 500,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                      >
                        {r.name}
                      </span>
                      {r.country && <Flag code={r.country} height={10} />}
                    </Link>
                  </Td>
                  <Td num>{r.played}</Td>
                  <Td num className="league-wdl">{r.wins}</Td>
                  <Td num className="league-wdl">{r.draws}</Td>
                  <Td num className="league-wdl">{r.losses}</Td>
                  <Td num strong>{fmt(r.points)}</Td>
                  <Td num dim>{fmt(r.sb)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showMovement && (up > 0 || down > 0) && (
        <p
          className="t-caption"
          style={{ padding: "var(--s2) var(--s4)", borderTop: "1px solid var(--border)" }}
        >
          {up > 0 && <>Top <span className="digits">{up}</span> promoted. </>}
          {down > 0 && <>Bottom <span className="digits">{down}</span> relegated.</>}
        </p>
      )}
    </div>
  );
}

/** Half-points read "3½" the way a club writes them, not "3.5". */
function fmt(n: number) {
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  if (!half) return String(whole);
  return whole === 0 ? "½" : `${whole}½`;
}

function Th({
  children, num, style, className, title,
}: {
  children: React.ReactNode; num?: boolean; style?: React.CSSProperties;
  className?: string; title?: string;
}) {
  return (
    <th
      className={className}
      title={title}
      style={{
        padding: "var(--s2) var(--s2)",
        textAlign: num ? "right" : "left",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--text-dim)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children, num, strong, dim, style, className,
}: {
  children: React.ReactNode; num?: boolean; strong?: boolean; dim?: boolean;
  style?: React.CSSProperties; className?: string;
}) {
  return (
    <td
      className={className}
      style={{
        padding: "var(--s2) var(--s2)",
        textAlign: num ? "right" : "left",
        fontSize: 13,
        fontWeight: strong ? 700 : 400,
        color: dim ? "var(--text-dim)" : "var(--text)",
        fontVariantNumeric: num ? "tabular-nums" : undefined,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </td>
  );
}
