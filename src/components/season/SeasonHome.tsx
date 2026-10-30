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
  // Guarded: a zero-length season divides by zero here and every
  // percentage downstream becomes NaN, which is what made the bar
  // render as a meaningless full or empty strip.
  const total = Math.max(1, endsAt.getTime() - startsAt.getTime());
  const done = Math.min(1, Math.max(0, (now - startsAt.getTime()) / total));
  const halfMark = Math.min(1, Math.max(0, (halfwayAt.getTime() - startsAt.getTime()) / total));
  /** Under 90 days is not a club year; label its ends by day. */
  const shortSeason = total < 90 * 86_400_000;

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
          <span className="t-caption">{endLabel(startsAt, shortSeason)}</span>
          <span className="t-caption">{endLabel(endsAt, shortSeason)}</span>
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

      {/* Before a ball is kicked there is nothing to lead and nothing
          to attend, so three dashes under three labels is not an empty
          state — it is the same absence printed three times. Say what
          happens next instead, and bring the numbers in the moment
          they mean something. */}
      {played.length === 0 ? (
        <div style={{ padding: "var(--s4)", borderTop: "1px solid var(--border)" }}>
          <p className="t-row" style={{ marginBottom: 4 }}>
            The season is open. Nobody has played yet.
          </p>
          <p className="t-rowmeta">
            {table.length > 0 ? (
              <>
                <span className="digits">{table.length}</span>{" "}
                {table.length === 1 ? "member is" : "members are"} in it. The table fills
                in as games are played — at a club night, or by arranging a league game
                with somebody you owe one to.
              </>
            ) : (
              "Place members into divisions and the table will start filling in."
            )}
          </p>
        </div>
      ) : (
        /* Three numbers worth a glance. More than three and nobody reads any. */
        <div
          style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
            borderTop: "1px solid var(--border)",
          }}
        >
          <Stat
            label="Leading"
            value={leader?.name.split(/\s+/)[0] ?? "—"}
            sub={leader ? `${fmt(leader.points)} pts` : undefined}
          />
          <Stat
            label="Best attendance"
            value={bestAttendance?.attendance ? bestAttendance.name.split(/\s+/)[0] : "—"}
            sub={bestAttendance?.attendance ? `${bestAttendance.attendance} nights` : undefined}
          />
          <Stat
            label="You"
            value={you && you.played > 0 ? `${fmt(you.points)}/${you.played}` : "—"}
            sub={
              you?.performance
                ? `${you.performance} perf`
                : you && you.played === 0
                  ? "no games yet"
                  : undefined
            }
          />
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

/**
 * A date on the end of the season bar.
 *
 * This was `{month:"short", year:"2-digit"}`, which renders November
 * 2026 as "Nov 26" — indistinguishable from the 26th of November, and
 * identical at both ends of any season beginning and ending in the
 * same month. A season running 1–26 November read "Nov 26 → Nov 26",
 * which looks like corrupt data and is not.
 *
 * Seasons shorter than a season gets the day; a real September-to-May
 * year gets the year. Neither can be misread as the other.
 */
function endLabel(d: Date, showDay: boolean) {
  return showDay
    ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}
