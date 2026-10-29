import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export interface ShelfItem {
  awardId: string;
  trophyId: string;
  trophyName: string;
  clubSlug: string;
  clubName: string;
  year: string;
  note: string | null;
}

/**
 * The shelf on somebody's profile.
 *
 * Silverware outranks every other number on a profile, so it sits above
 * them. Each row links back to the roll it belongs to — the point is not
 * that you won something, it is whose name you are next to.
 */
export function TrophyShelf({ trophies }: { trophies: ShelfItem[] }) {
  if (trophies.length === 0) return null;

  return (
    <section>
      <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>
        Honours
      </h2>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-gold)",
          borderRadius: "var(--r-lg)",
          overflow: "hidden",
        }}
      >
        {trophies.map((t, i) => (
          <Link
            key={t.awardId}
            href={`/club/${t.clubSlug}/trophies/${t.trophyId}`}
            className="press"
            style={{
              display: "flex", alignItems: "center", gap: "var(--s3)",
              padding: "var(--s3) var(--s4)", minHeight: 52,
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
              textDecoration: "none", color: "inherit",
            }}
          >
            <span aria-hidden="true" style={{ flexShrink: 0, color: "var(--gold)" }}>
              <Icon name="flag" size={16} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {/* Trophy names are long and the name is the point. */}
              <span className="t-row" style={{ display: "block" }}>{t.trophyName}</span>
              <span
                className="t-rowmeta"
                style={{
                  display: "block",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {t.clubName}
                {t.note ? ` · ${t.note}` : ""}
              </span>
            </span>
            <span
              className="digits"
              style={{ flexShrink: 0, fontSize: 13, color: "var(--text-muted)" }}
            >
              {t.year}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
