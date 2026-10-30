import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { JoinClubButton } from "@/components/club/JoinClubButton";

/**
 * The club, above every tab.
 *
 * One block that never changes as you move between sections: who this
 * club is, how many of them there are, how many are in the room right
 * now, and the single thing you are most likely to want to do.
 *
 * "Running the club" is an icon here rather than a dashed box in the
 * content, because the machinery of a club is used by three people and
 * read by none.
 */
export function ClubHeader({
  slug,
  name,
  city,
  country,
  description,
  memberCount,
  onlineCount,
  liveCount,
  role,
  isMember,
  canSignIn,
  organiser,
  invite,
}: {
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  description: string | null;
  memberCount: number;
  onlineCount: number;
  liveCount: number;
  role: string | null;
  isMember: boolean;
  canSignIn: boolean;
  organiser: boolean;
  invite?: string;
}) {
  const place = [city, country].filter(Boolean).join(", ");

  return (
    <header style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
        <span
          aria-hidden="true"
          style={{
            width: 52, height: 52, borderRadius: "var(--r-md)", flexShrink: 0,
            display: "grid", placeItems: "center",
            background: "var(--gold-wash)", color: "var(--gold)",
            border: "1px solid var(--border-gold)",
          }}
        >
          <Icon name="castle" size={26} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="font-display t-h1" style={{ overflowWrap: "break-word" }}>{name}</h1>
          <p className="t-rowmeta">
            {place && <>{place} · </>}
            <span className="digits">{memberCount}</span>{" "}
            {memberCount === 1 ? "member" : "members"}
          </p>
        </div>

        {organiser && (
          <Link
            href={`/club/${slug}/season`}
            aria-label="Running the club"
            title="Running the club"
            className="press"
            style={{
              width: 40, height: 40, borderRadius: "var(--r-md)", flexShrink: 0,
              display: "grid", placeItems: "center", textDecoration: "none",
              background: "var(--surface)", border: "1px solid var(--border)",
              color: "var(--text-muted)",
            }}
          >
            <Icon name="grid" size={18} />
          </Link>
        )}
      </div>

      {description && <p className="t-body">{description}</p>}

      {/* The pulse bar: the room, right now. */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: "var(--s2)",
          padding: "var(--s2) var(--s3)", borderRadius: "var(--r-full)",
          background: "var(--surface)", border: "1px solid var(--border)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
            background: onlineCount > 0 ? "var(--success)" : "var(--text-dim)",
          }}
        />
        <span className="t-caption" style={{ color: "var(--text-muted)", flex: 1, minWidth: 0 }}>
          {onlineCount > 0 ? (
            <>
              <span className="digits">{onlineCount}</span> here now
            </>
          ) : (
            "Nobody here right now"
          )}
          {liveCount > 0 && (
            <>
              {" · "}
              <span className="digits">{liveCount}</span>{" "}
              {liveCount === 1 ? "game" : "games"} live
            </>
          )}
        </span>
        {isMember && role && role !== "PLAYER" && (
          <span
            className="t-caption"
            style={{ flexShrink: 0, color: "var(--gold)", fontWeight: 600, whiteSpace: "nowrap" }}
          >
            {role.replace(/_/g, " ").toLowerCase()}
          </span>
        )}
      </div>

      {canSignIn && !isMember && <JoinClubButton slug={slug} invite={invite} />}
    </header>
  );
}
