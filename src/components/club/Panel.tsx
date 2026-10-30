import Link from "next/link";

/**
 * A designed empty state with one thing to do.
 *
 * Every tab has places where a young club has nothing yet. A bare list
 * or a dash teaches nobody that the feature exists, so each of those
 * places gets a sentence and a single next step instead.
 */
export function Panel({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div
      style={{
        border: "1px dashed var(--border)",
        borderRadius: "var(--r-lg)",
        padding: "var(--s5) var(--s4)",
        textAlign: "center",
      }}
    >
      <p className="t-row" style={{ marginBottom: 4 }}>{title}</p>
      <p className="t-rowmeta" style={{ maxWidth: 380, marginInline: "auto" }}>{body}</p>
      {href && cta && (
        <Link
          href={href}
          className="press"
          style={{
            display: "inline-flex", alignItems: "center", minHeight: 38,
            padding: "0 16px", marginTop: "var(--s3)",
            borderRadius: "var(--r-full)", textDecoration: "none",
            background: "var(--gold)", color: "var(--gold-ink)",
            fontSize: "var(--t-secondary)", fontWeight: 600,
          }}
        >
          {cta}
        </Link>
      )}
    </div>
  );
}

/**
 * What a panel looks like while its own query is still running.
 *
 * Each section streams in on its own, so the page has a shape before
 * the slowest query finishes rather than after it.
 */
export function PanelSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
      }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex", alignItems: "center", gap: "var(--s3)",
            padding: "var(--s3) var(--s4)", minHeight: 56,
            borderTop: i === 0 ? "none" : "1px solid var(--border)",
          }}
        >
          <span
            className="skeleton"
            style={{ width: 30, height: 30, borderRadius: "var(--r-md)", flexShrink: 0 }}
          />
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="skeleton" style={{ height: 11, width: "58%", borderRadius: 4 }} />
            <span className="skeleton" style={{ height: 9, width: "34%", borderRadius: 4 }} />
          </span>
        </div>
      ))}
    </div>
  );
}
