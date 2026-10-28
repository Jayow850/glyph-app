import type { ReactNode } from "react";
import { Avatar } from "./Avatar";
import { Flag } from "./Flag";

/**
 * Every list row in GLYPH.
 *
 * The open seek row was six flex columns in one line — name, handle,
 * speed icon, time control, rated, rating, gap-to-you, expiry, button —
 * and at 360px they collided into "@an… ⚡ 2|1 rated 1676 237 below you
 * 16m left Play". The failure was not styling. It was asking one line
 * to hold nine things.
 *
 * So the shape is fixed and the content bends to it:
 *
 *   [avatar]  Name · flag · rating            [ action ]
 *             metadata · metadata · metadata
 *
 * Line one is identity and never wraps. Line two is ONE muted sentence
 * of dot-separated facts, and it wraps as a sentence — never as
 * columns, because columns are what collapse. The action is fixed
 * width on the right and is the only thing allowed to compete with the
 * name for space.
 */
export function ListRow({
  name,
  country,
  title,
  rating,
  meta,
  action,
  avatar = true,
  icon,
  href,
  highlight = false,
  size = "md",
}: {
  name: string;
  country?: string | null;
  /** ChessTitle; "NONE" and null both mean no badge. */
  title?: string | null;
  rating?: string | null;
  /** Facts for line two, joined with middots. Falsy entries drop out. */
  meta?: (ReactNode | null | false | undefined)[];
  action?: ReactNode;
  /** Set false for a row that is not a person. */
  avatar?: boolean;
  /** Drawn in place of the avatar — for a row that is a thing, not a person. */
  icon?: ReactNode;
  href?: string;
  /** A gold left edge, for a row that wants something from you. */
  highlight?: boolean;
  size?: "sm" | "md";
}) {
  const hasTitle = Boolean(title) && title !== "NONE";
  const avatarSize = size === "sm" ? 34 : 40;
  const parts = (meta ?? []).filter(Boolean) as ReactNode[];

  const inner = (
    <>
      {icon ?? (avatar && <Avatar name={name} size={avatarSize} />)}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Identity. One line, and the name gets whatever is left. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {hasTitle && (
            <span
              style={{
                fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                background: "var(--gold)", color: "var(--gold-ink)", flexShrink: 0,
              }}
            >
              {title}
            </span>
          )}
          <span
            className="t-row"
            style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {name}
          </span>
          {country && <Flag code={country} height={12} />}
          {rating && (
            <span className="digits" style={{ fontSize: 13, color: "var(--text-muted)", flexShrink: 0 }}>
              {rating}
            </span>
          )}
        </div>

        {/* Metadata. A sentence, not a table. */}
        {parts.length > 0 && (
          <p className="t-rowmeta" style={{ marginTop: 1 }}>
            {parts.map((part, i) => (
              <span key={i}>
                {i > 0 && <span style={{ opacity: 0.5 }}> · </span>}
                {part}
              </span>
            ))}
          </p>
        )}
      </div>

      {action && <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{action}</div>}
    </>
  );

  const style = {
    display: "flex",
    alignItems: "center",
    gap: "var(--s3)",
    minHeight: 64,
    padding: "var(--s3) var(--s4)",
    textDecoration: "none",
    color: "inherit",
    borderLeft: highlight ? "2px solid var(--gold)" : "2px solid transparent",
  } as const;

  if (href) {
    return <a href={href} className="press" style={style}>{inner}</a>;
  }
  return <div style={style}>{inner}</div>;
}

/** The divider between rows, so a list never draws its own. */
export function ListGroup({ children }: { children: ReactNode }) {
  return (
    <div
      className="list-group"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}
