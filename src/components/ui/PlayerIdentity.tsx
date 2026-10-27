import { Avatar } from "./Avatar";

export type PlayerSize = "sm" | "md" | "lg";

export interface PlayerIdentityProps {
  name: string;
  handle?: string | null;
  rating?: string | null;
  /** ISO 3166-1 alpha-2, as stored on Profile.country. */
  country?: string | null;
  /** ChessTitle; "NONE" and null are both treated as no title. */
  title?: string | null;
  size?: PlayerSize;
  /** Draw a gold ring on the avatar — used for "to move". */
  active?: boolean;
  /** Presence, once we track it. Omit entirely until then. */
  presence?: "online" | "away" | "offline" | null;
  /** Anything that belongs on the second line after the handle. */
  meta?: React.ReactNode;
}

const SIZES: Record<PlayerSize, { avatar: number; name: number; meta: number }> = {
  sm: { avatar: 32, name: 14, meta: 12 },
  md: { avatar: 40, name: 16, meta: 13 },
  lg: { avatar: 56, name: 20, meta: 14 },
};

const PRESENCE_COLOR = {
  online: "var(--success)",
  away: "var(--gold)",
  offline: "var(--text-dim)",
} as const;

/**
 * Country, as a code rather than an emoji flag.
 *
 * Emoji flags are not a safe cross-platform choice: Windows ships no
 * regional-indicator glyphs at all, so 🇳🇬 renders as two boxed letters
 * there while looking correct on the phone you tested on. A typographic
 * pill renders identically everywhere and sits better in this design
 * language. Swap for an SVG sprite later if real flags are wanted.
 */
function CountryTag({ code }: { code: string }) {
  return (
    <span
      title={code.toUpperCase()}
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        padding: "1px 5px",
        borderRadius: 4,
        background: "var(--surface-2)",
        color: "var(--text-muted)",
        flexShrink: 0,
        lineHeight: 1.5,
      }}
    >
      {code.toUpperCase()}
    </span>
  );
}

function TitleBadge({ title }: { title: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        padding: "1px 5px",
        borderRadius: 4,
        background: "var(--gold)",
        color: "var(--gold-ink)",
        flexShrink: 0,
        lineHeight: 1.5,
      }}
    >
      {title}
    </span>
  );
}

/**
 * The one way a person is shown anywhere in GLYPH — game bars, challenge
 * rows, the opponent picker, standings, the feed, profile headers.
 * Every bespoke player row in the app should become one of these.
 */
export function PlayerIdentity({
  name,
  handle,
  rating,
  country,
  title,
  size = "md",
  active = false,
  presence = null,
  meta,
}: PlayerIdentityProps) {
  const s = SIZES[size];
  const hasTitle = Boolean(title) && title !== "NONE";
  const secondLine = handle || rating || meta;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)", minWidth: 0 }}>
      <span style={{ position: "relative", flexShrink: 0, display: "block" }}>
        <Avatar name={name} size={s.avatar} ring={active} />
        {presence && (
          <span
            aria-label={presence}
            style={{
              position: "absolute", right: -1, bottom: -1,
              width: 11, height: 11, borderRadius: "50%",
              background: PRESENCE_COLOR[presence],
              border: "2px solid var(--surface)",
            }}
          />
        )}
      </span>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {hasTitle && <TitleBadge title={title as string} />}
          <span
            style={{
              fontSize: s.name,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </span>
          {country && <CountryTag code={country} />}
        </div>

        {secondLine && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: s.meta, color: "var(--text-muted)", minWidth: 0,
            }}
          >
            {handle && (
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                @{handle}
              </span>
            )}
            {rating && <span className="digits" style={{ fontWeight: 600 }}>{rating}</span>}
            {meta}
          </div>
        )}
      </div>
    </div>
  );
}
