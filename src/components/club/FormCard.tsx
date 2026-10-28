import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { CATEGORY_ORDER, CATEGORY_LABEL } from "@engine/game/timeControls";

export interface FormCardProps {
  streak: { days: number; today: number; recoverable: boolean; best: number };
  /** Other club members on a streak of the same length or longer. */
  companions: number;
  /** A clubmate whose streak lapses today, if there is one worth naming. */
  nudge?: { name: string; handle: string; days: number } | null;
  form: ("W" | "L" | "D")[];
  ratings: Record<string, { rating: number; rd: number; games: number } | undefined>;
  /** Points to the next round hundred, and in which category. */
  milestone?: { category: string; points: number; target: number } | null;
  clubRank?: { place: number; club: string } | null;
}

const PIP = { W: "var(--success)", L: "var(--danger)", D: "var(--draw)" } as const;

/**
 * "Your form" — what a flat row of four rating numbers was pretending
 * to be.
 *
 * Everything here is chess-native. No coins, no confetti, no invented
 * currency: the research on points-and-badges is that surface
 * mechanics copied from games trick people rather than motivate them,
 * and the experience has to carry the engagement. A streak of days you
 * actually played, your last five results, and how far you are from a
 * number you care about are all things a chess player already wants to
 * know.
 *
 * The streak is shown in the club's context on purpose. Keeping one
 * alongside other people is a different proposition from keeping one
 * alone, and a club is the one place that can be true.
 */
export function FormCard({
  streak, companions, nudge, form, ratings, milestone, clubRank,
}: FormCardProps) {
  const alive = streak.days > 0;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
      }}
    >
      {/* The streak, and who else is in it with you. */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)", padding: "var(--s4)" }}>
        <span
          aria-hidden="true"
          style={{
            width: 44, height: 44, borderRadius: "var(--r-md)", flexShrink: 0,
            display: "grid", placeItems: "center",
            background: alive ? "var(--gold-wash)" : "var(--surface-2)",
            color: alive ? "var(--gold)" : "var(--text-dim)",
          }}
        >
          <Icon name="bolt" size={22} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="t-row">
            {alive ? (
              <>
                <span className="digits">{streak.days}</span>
                {streak.days === 1 ? " day" : " days"} in a row
              </>
            ) : streak.recoverable ? (
              "Your streak is paused"
            ) : (
              "No streak yet"
            )}
          </p>
          <p className="t-rowmeta">
            {alive && companions > 0
              ? `You and ${companions} other${companions === 1 ? "" : "s"} in the club are on a run`
              : alive
                ? streak.today > 0 ? "Today is counted" : "Play one game to keep it"
                : streak.recoverable
                  ? "Play two games today to earn yesterday back"
                  : "One game a day starts it"}
          </p>
        </div>

        {streak.best > streak.days && streak.best > 2 && (
          <span className="t-caption digits" style={{ flexShrink: 0, color: "var(--text-dim)" }}>
            best {streak.best}
          </span>
        )}
      </div>

      {/* A clubmate about to lose theirs. The most useful thing this
          card can do is turn one person's lapse into a game. */}
      {nudge && (
        <Link
          href={`/profile/${nudge.handle}`}
          style={{
            display: "flex", alignItems: "center", gap: "var(--s2)",
            padding: "var(--s2) var(--s4)", textDecoration: "none",
            background: "var(--gold-wash)", color: "var(--gold)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <Icon name="swords" size={15} />
          <span className="t-caption" style={{ color: "inherit" }}>
            {nudge.name} hasn&apos;t played today — challenge them?
          </span>
        </Link>
      )}

      {/* Last five, newest first. */}
      {form.length > 0 && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: "var(--s3)",
            padding: "var(--s3) var(--s4)", borderTop: "1px solid var(--border)",
          }}
        >
          <span className="t-rowmeta" style={{ flexShrink: 0 }}>Last {form.length}</span>
          <span style={{ display: "flex", gap: 4 }}>
            {form.map((r, i) => (
              <span
                key={i}
                title={r === "W" ? "Win" : r === "L" ? "Loss" : "Draw"}
                style={{
                  width: 20, height: 20, borderRadius: "50%",
                  display: "grid", placeItems: "center",
                  fontSize: 10, fontWeight: 700,
                  background: PIP[r], color: "var(--bg)",
                }}
              >
                {r}
              </span>
            ))}
          </span>
          <span style={{ flex: 1 }} />
          {clubRank && (
            <span className="t-caption" style={{ flexShrink: 0 }}>
              #<span className="digits">{clubRank.place}</span> in {clubRank.club}
            </span>
          )}
        </div>
      )}

      {/* Rating per category. Tabular, provisional keeps its "?". */}
      <div
        style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          borderTop: "1px solid var(--border)",
        }}
      >
        {CATEGORY_ORDER.map((c, i) => {
          const row = ratings[c];
          return (
            <div
              key={c}
              style={{
                textAlign: "center", padding: "var(--s3) var(--s1)",
                borderLeft: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <p
                className="digits"
                style={{ fontSize: 17, fontWeight: 700, color: row ? "var(--text)" : "var(--text-dim)" }}
              >
                {row ? Math.round(row.rating) : "—"}
                {row && row.rd > 110 && <span style={{ color: "var(--text-dim)" }}>?</span>}
              </p>
              <p className="t-caption" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                {CATEGORY_LABEL[c]}
              </p>
            </div>
          );
        })}
      </div>

      {milestone && (
        <p
          className="t-caption"
          style={{ padding: "var(--s2) var(--s4) var(--s3)", borderTop: "1px solid var(--border)" }}
        >
          <span className="digits">{milestone.points}</span> points from{" "}
          <span className="digits">{milestone.target}</span> {milestone.category.toLowerCase()}
        </p>
      )}
    </div>
  );
}
