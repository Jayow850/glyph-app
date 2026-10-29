import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { Flag } from "@/components/ui/Flag";
import { TROPHY_KIND_LABEL, type RollView } from "@/lib/services/trophies";
import { BackfillForm } from "@/components/trophy/BackfillForm";

/**
 * The roll of honour.
 *
 * One trophy, and every name on it. This is the page a club shows a
 * visitor, and the page a winner comes back to years later, so it is
 * given air and a serif and nothing else. No cards, no chrome, no
 * engagement furniture — a list of names in a column, oldest at the
 * top, the way it reads on the cup.
 */
export function RollOfHonour({
  trophy,
  officer,
}: {
  trophy: RollView;
  officer: boolean;
}) {
  const current = trophy.winners[trophy.winners.length - 1] ?? null;

  return (
    <div
      className="page-bottom"
      style={{ paddingTop: "var(--s5)", display: "flex", flexDirection: "column", gap: "var(--s5)" }}
    >
      <Link
        href={`/club/${trophy.clubSlug}`}
        className="press"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          color: "var(--text-muted)", textDecoration: "none", fontSize: "var(--t-secondary)",
        }}
      >
        <Icon name="chevronLeft" size={14} />
        {trophy.clubName}
      </Link>

      {/* The cup itself. Fraunces earns its place here if anywhere does. */}
      <header style={{ textAlign: "center", padding: "var(--s4) 0" }}>
        <h1 className="font-display" style={{ fontSize: 32, lineHeight: 1.15, fontWeight: 600 }}>
          {trophy.name}
        </h1>
        {trophy.namedAfter && (
          <p className="t-secondary" style={{ marginTop: "var(--s2)" }}>
            In memory of {trophy.namedAfter}
          </p>
        )}
        {trophy.description && (
          <p
            className="t-secondary"
            style={{ marginTop: "var(--s3)", maxWidth: 440, marginInline: "auto" }}
          >
            {trophy.description}
          </p>
        )}
        <p className="t-caption" style={{ marginTop: "var(--s3)" }}>
          {TROPHY_KIND_LABEL[trophy.awardedFor]}
          {trophy.winners.length > 0 && (
            <>
              {" · "}
              <span className="digits">{trophy.winners.length}</span>{" "}
              {trophy.winners.length === 1 ? "name" : "names"}
              {" · since "}
              <span className="digits">{trophy.winners[0].year}</span>
            </>
          )}
        </p>
      </header>

      {current && (
        <div style={{ textAlign: "center" }}>
          <p className="section-label" style={{ marginBottom: "var(--s2)" }}>Holder</p>
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: "var(--s3)",
              padding: "var(--s3) var(--s4)", maxWidth: "100%",
              border: "1px solid var(--border-gold)", borderRadius: "var(--r-lg)",
            }}
          >
            <Avatar name={current.name} size={40} ring />
            <div style={{ textAlign: "left", minWidth: 0 }}>
              <p className="t-row" style={{ fontSize: 17, overflowWrap: "anywhere" }}>
                {current.name}
              </p>
              <p className="t-rowmeta">
                <span className="digits">{current.year}</span>
                {current.note ? ` · ${current.note}` : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Every name, oldest first. */}
      <section>
        <h2 className="section-label" style={{ marginBottom: "var(--s3)", textAlign: "center" }}>
          Roll of honour
        </h2>

        {trophy.winners.length === 0 ? (
          <div
            style={{
              border: "1px dashed var(--border)", borderRadius: "var(--r-lg)",
              padding: "var(--s5) var(--s4)", textAlign: "center",
            }}
          >
            <p className="t-row" style={{ marginBottom: 4 }}>No names on it yet</p>
            <p className="t-rowmeta">
              {officer
                ? "Add your club's winners below — as far back as you like."
                : "The first winner will appear here."}
            </p>
          </div>
        ) : (
          <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {trophy.winners.map((w) => (
              <li
                key={w.id}
                style={{
                  display: "flex", alignItems: "center", gap: "var(--s3)",
                  padding: "var(--s3) var(--s2)", minHeight: 52,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span
                  className="digits"
                  style={{
                    width: 62, flexShrink: 0, fontSize: 13,
                    color: "var(--text-dim)", fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {w.year}
                </span>

                {w.handle ? (
                  <Link
                    href={`/profile/${w.handle}`}
                    style={{
                      display: "flex", alignItems: "center", gap: "var(--s2)",
                      flex: 1, minWidth: 0, textDecoration: "none", color: "inherit",
                    }}
                  >
                    <Avatar name={w.name} size={28} />
                    <Name w={w} />
                  </Link>
                ) : (
                  <span
                    style={{ display: "flex", alignItems: "center", gap: "var(--s2)", flex: 1, minWidth: 0 }}
                  >
                    <Avatar name={w.name} size={28} />
                    <Name w={w} />
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {officer && <BackfillForm trophyId={trophy.id} trophyName={trophy.name} />}
    </div>
  );
}

function Name({
  w,
}: {
  w: { name: string; note: string | null; country: string | null };
}) {
  return (
    <span style={{ minWidth: 0 }}>
      {/* The name wraps rather than truncating. A roll of honour that
          renders "D. Olughsomething-Longn…" has failed at its one job,
          and hyphenated names are common among the people on it. */}
      <span
        style={{
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
          minWidth: 0, fontSize: 15, fontWeight: 500, lineHeight: 1.3,
        }}
      >
        <span style={{ overflowWrap: "anywhere" }}>{w.name}</span>
        {w.country && <Flag code={w.country} height={10} />}
      </span>
      {w.note && <span className="t-caption" style={{ color: "var(--text-dim)" }}>{w.note}</span>}
    </span>
  );
}
