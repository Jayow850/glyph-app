import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { TROPHY_KIND_LABEL, type TrophyView } from "@/lib/services/trophies";

/**
 * The cabinet by the door.
 *
 * Each cup and who holds it. The row carries the name and nothing that
 * competes with it: at 360px a holder avatar and a "since" column left
 * about 180px for the name, and real club trophies are called things
 * like "The Mwangi Shield for Most Improved Player". The name wraps
 * rather than truncating — a half-named cup is worse than a tall row.
 * The year it goes back to is on the roll itself, one tap away.
 */
export function TrophyCabinet({
  clubSlug,
  trophies,
  canAdd,
}: {
  clubSlug: string;
  trophies: TrophyView[];
  canAdd: boolean;
}) {
  if (trophies.length === 0) {
    return (
      <div
        style={{
          border: "1px dashed var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "var(--s5) var(--s4)",
          textAlign: "center",
        }}
      >
        <p className="t-row" style={{ marginBottom: 4 }}>No trophies yet</p>
        <p className="t-rowmeta">
          {canAdd
            ? "Add your club's roll of honour — every cup, every winner, as far back as it goes."
            : "This club has not added its roll of honour."}
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
      }}
    >
      {trophies.map((t, i) => (
        <Link
          key={t.id}
          href={`/club/${clubSlug}/trophies/${t.id}`}
          className="press"
          style={{
            display: "flex", alignItems: "center", gap: "var(--s3)",
            padding: "var(--s3) var(--s4)", minHeight: 60,
            borderTop: i === 0 ? "none" : "1px solid var(--border)",
            textDecoration: "none", color: "inherit",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 34, height: 34, borderRadius: "var(--r-md)", flexShrink: 0,
              display: "grid", placeItems: "center",
              background: t.holder ? "var(--gold)" : "var(--surface-2)",
              color: t.holder ? "var(--gold-ink)" : "var(--text-dim)",
            }}
          >
            <Icon name="flag" size={16} />
          </span>

          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="t-row" style={{ display: "block" }}>{t.name}</span>
            <span
              className="t-rowmeta"
              style={{
                display: "block",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {t.holder ? (
                <>
                  {t.holder.name} · <span className="digits">{t.holder.year}</span>
                </>
              ) : t.since ? (
                <>
                  {TROPHY_KIND_LABEL[t.awardedFor]} · since{" "}
                  <span className="digits">{t.since}</span>
                </>
              ) : (
                TROPHY_KIND_LABEL[t.awardedFor]
              )}
            </span>
          </span>

          <Icon name="chevronRight" size={16} />
        </Link>
      ))}
    </div>
  );
}
