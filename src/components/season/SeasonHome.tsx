import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import type { SeasonRow } from "@/lib/services/season";

export interface SeasonHomeProps {
  name: string;
  startsAt: Date;
  halfwayAt: Date;
  endsAt: Date;
  half: "AUTUMN" | "SPRING";
  table: SeasonRow[];
  youId?: string | null;
  championship: {
    autumnWinnerName: string | null;
    springWinnerName: string | null;
    outright: boolean;
    championName: string | null;
    decidedBy: string | null;
  } | null;
}

/**
 * Where the club is in its year.
 *
 * A season is an arc, so this leads with position along it rather than
 * with a table: which half we are in, how far through, and who is in
 * front. The detail is below; the shape of the year is at the top.
 */
export function SeasonHome({
  name, startsAt, halfwayAt, endsAt, half, table, youId, championship,
}: SeasonHomeProps) {
  const now = Date.now();
  const total = endsAt.getTime() - startsAt.getTime();
  const done = Math.min(1, Math.max(0, (now - startsAt.getTime()) / total));
  const halfMark = (halfwayAt.getTime() - startsAt.getTime()) / total;

  const played = table.filter((r) => r.played > 0);
  const leader = played[0];
  const you = youId ? table.find((r) => r.userId === youId) : null;
  const bestAttendance = [...played].sort((a, b) => b.attendance - a.attendance)[0];

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "var(--s4)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "var(--s2)", flexWrap: "wrap" }}>
          <h2 className="t-row" style={{ fontSize: 17 }}>{name}</h2>
          <span className="t-rowmeta">
            {half === "AUTUMN" ? "Autumn half" : "Spring half"}
          </span>
        </div>

        {/* The year as a line, with the Christmas split marked on it. */}
        <div
          role="img"
          aria-label={`${Math.round(done * 100)} per cent through the season`}
          style={{
            position: "relative", height: 6, marginTop: "var(--s3)",
            borderRadius: "var(--r-full)", background: "var(--surface-2)", overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute", inset: 0, width: `${done * 100}%`,
              background: "var(--gold)", borderRadius: "var(--r-full)",
            }}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute", top: 0, bottom: 0, left: `${halfMark * 100}%`,
              width: 2, background: "var(--bg)",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span className="t-caption">{month(startsAt)}</span>
          <span className="t-caption">{month(endsAt)}</span>
        </div>
      </div>

      {/* The champion race, which is the thing a season is for. */}
      {championship && (
        <div style={{ padding: "var(--s3) var(--s4)", borderTop: "1px solid var(--border)" }}>
          <p className="section-label" style={{ marginBottom: "var(--s2)" }}>The championship</p>
          {championship.championName ? (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
              <Avatar name={championship.championName} size={28} ring />
              <div style={{ minWidth: 0 }}>
                <p className="t-row">{championship.championName}</p>
                <p className="t-rowmeta">
                  {championship.outright
                    ? "Champion outright — won both halves."
                    : (championship.decidedBy ?? "Club champion.")}
                </p>
              </div>
            </div>
          ) : (
            <p className="t-rowmeta">
              {championship.autumnWinnerName ?? "Autumn, to be decided"}
              {" against "}
              {championship.springWinnerName ?? "spring, to be decided"}
              {". Two games, colours reversed."}
            </p>
          )}
        </div>
      )}

      {/* Three numbers worth a glance. More than three and nobody reads any. */}
      <div
        style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
          borderTop: "1px solid var(--border)",
        }}
      >
        <Stat label="Leading" value={leader?.name.split(/\s+/)[0] ?? "—"} sub={leader ? `${fmt(leader.points)} pts` : undefined} />
        <Stat
          label="Best attendance"
          value={bestAttendance?.attendance ? bestAttendance.name.split(/\s+/)[0] : "—"}
          sub={bestAttendance?.attendance ? `${bestAttendance.attendance} nights` : undefined}
        />
        <Stat
          label="You"
          value={you && you.played > 0 ? `${fmt(you.points)}/${you.played}` : "—"}
          sub={you?.performance ? `${you.performance} perf` : you && you.played === 0 ? "no games yet" : undefined}
        />
      </div>

      {played.length === 0 && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: "var(--s2)",
            padding: "var(--s3) var(--s4)", borderTop: "1px solid var(--border)",
          }}
        >
          <Icon name="hourglass" size={14} />
          <p className="t-rowmeta">No games played yet. The season starts when somebody plays one.</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ padding: "var(--s3) var(--s4)", minWidth: 0 }}>
      <p className="t-caption" style={{ marginBottom: 2 }}>{label}</p>
      <p
        className="t-row"
        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {value}
      </p>
      {sub && <p className="t-caption" style={{ color: "var(--text-dim)" }}>{sub}</p>}
    </div>
  );
}

function fmt(n: number) {
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  if (!half) return String(whole);
  return whole === 0 ? "½" : `${whole}½`;
}

function month(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}
