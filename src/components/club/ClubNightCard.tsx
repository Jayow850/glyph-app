"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Flag } from "@/components/ui/Flag";
import { Icon } from "@/components/ui/Icon";

export interface ClubNightCardProps {
  id: string;
  clubSlug: string;
  clubName?: string;
  /** ISO string — a Date does not survive the server/client boundary intact. */
  startsAt: string;
  timeControl: string;
  rounds: number;
  state: "SCHEDULED" | "LIVE" | "FINISHED" | "CANCELLED";
  tournamentId: string | null;
  going: { userId: string; name: string; country: string | null; title: string | null }[];
  maybe: number;
  yourState: "GOING" | "MAYBE" | "OUT" | null;
  startable: boolean;
  canStart: boolean;
  /** On the Games page the club's name leads; on the club page it is redundant. */
  showClub?: boolean;
  /**
   * Members RSVP; visitors just see when it is.
   *
   * A visitor seeing "Tuesdays, 7:30, three rounds" is the best
   * recruiting the page does. A visitor tapping Going and getting a
   * 403 is the worst.
   */
  canRsvp?: boolean;
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const COUNTDOWN_MS = 24 * 60 * 60 * 1000;

/** "4h 12m", "12m 30s", "now". Seconds only appear in the last hour, where they mean something. */
function remaining(ms: number) {
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

/**
 * The club's weekly night.
 *
 * A countdown only earns its place close to the event. Further out it
 * is noise that makes a page feel anxious, so beyond 24 hours this
 * says the day and the time like an invitation, and only inside the
 * window does it start counting.
 */
export function ClubNightCard(props: ClubNightCardProps) {
  const { id, clubSlug, clubName, timeControl, rounds, going, maybe, showClub } = props;
  const canRsvp = props.canRsvp ?? true;

  const starts = new Date(props.startsAt);
  const [now, setNow] = useState(() => Date.now());
  const [yours, setYours] = useState(props.yourState);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const msUntil = starts.getTime() - now;
  const imminent = msUntil <= COUNTDOWN_MS;
  const live = props.state === "LIVE";

  // Tick only while a countdown is on screen. A timer running on a page
  // that shows no seconds is a battery drain nobody can see.
  useEffect(() => {
    if (!imminent || live) return;
    const everySecond = msUntil < 60 * 60 * 1000;
    const t = setInterval(() => setNow(Date.now()), everySecond ? 1000 : 30_000);
    return () => clearInterval(t);
  }, [imminent, live, msUntil]);

  async function rsvp(state: "GOING" | "MAYBE" | "OUT") {
    if (busy) return;
    const previous = yours;
    setBusy(true);
    setYours(state);
    try {
      const res = await fetch(`/api/club-nights/${id}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Saying you are going, inside the window, is also saying you are here.
        body: JSON.stringify({ state, checkIn: state === "GOING" && imminent }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setYours(previous);
    } finally {
      setBusy(false);
    }
  }

  async function start(finish = false) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/club-nights/${id}/start${finish ? "?finish=1" : ""}`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.tournamentId) {
        router.push(`/club/${clubSlug}/tournaments/${data.tournamentId}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const left = remaining(msUntil);
  const when = live
    ? "Under way"
    : left && imminent
      ? `Starts in ${left}`
      : starts.toLocaleString(undefined, {
          weekday: "long",
          hour: "numeric",
          minute: "2-digit",
        });

  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1px solid ${live || imminent ? "var(--border-gold)" : "var(--border)"}`,
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)", padding: "var(--s3) var(--s4)" }}>
        <span
          aria-hidden="true"
          style={{
            width: 36, height: 36, borderRadius: "var(--r-md)", flexShrink: 0,
            display: "grid", placeItems: "center",
            background: live ? "var(--gold)" : "var(--surface-2)",
            color: live ? "var(--gold-ink)" : "var(--text-muted)",
          }}
        >
          <Icon name="castle" size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="t-row" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {showClub && clubName ? `${clubName} club night` : "Club night"}
          </p>
          <p className="t-rowmeta">
            <span style={{ color: live || imminent ? "var(--gold)" : undefined }}>{when}</span>
            {" · "}
            <span className="digits">{timeControl.replace("+", "+")}</span>
            {" · "}
            <span className="digits">{rounds}</span> rounds
          </p>
        </div>
      </div>

      {/* Who is coming. Names, not a number — a number is a statistic, names are people you know. */}
      {(going.length > 0 || maybe > 0) && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: "var(--s2)", flexWrap: "wrap",
            padding: "var(--s3) var(--s4)", borderTop: "1px solid var(--border)",
          }}
        >
          {going.slice(0, 6).map((p) => (
            <span key={p.userId} style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <Avatar name={p.name} size={24} />
              <span className="t-rowmeta" style={{ color: "var(--text)", whiteSpace: "nowrap" }}>
                {p.name.split(/\s+/)[0]}
              </span>
              {p.country && <Flag code={p.country} height={10} />}
            </span>
          ))}
          {going.length > 6 && (
            <span className="t-rowmeta">
              +<span className="digits">{going.length - 6}</span> more
            </span>
          )}
          {going.length === 0 && <span className="t-rowmeta">Nobody yet — be the first.</span>}
          {maybe > 0 && (
            <span className="t-rowmeta" style={{ marginLeft: "auto" }}>
              <span className="digits">{maybe}</span> maybe
            </span>
          )}
        </div>
      )}

      {/* Actions. Live goes straight to the pairings; everything else is an RSVP. */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: "var(--s2)", flexWrap: "wrap",
          padding: "var(--s3) var(--s4)", borderTop: "1px solid var(--border)",
        }}
      >
        {live && props.tournamentId ? (
          <>
            <Link
              href={`/club/${clubSlug}/tournaments/${props.tournamentId}`}
              className="press"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36,
                padding: "0 14px", borderRadius: "var(--r-full)",
                background: "var(--gold)", color: "var(--gold-ink)",
                fontSize: "var(--t-secondary)", fontWeight: 600, textDecoration: "none",
              }}
            >
              <Icon name="swords" size={14} />
              Pairings
            </Link>
            {props.canStart && (
              <button onClick={() => start(true)} disabled={busy} className="press" style={ghost}>
                Finish night
              </button>
            )}
          </>
        ) : (
          <>
            {canRsvp && (["GOING", "MAYBE", "OUT"] as const).map((s) => (
              <button
                key={s}
                onClick={() => rsvp(s)}
                disabled={busy}
                className="press"
                style={{
                  minHeight: 36, padding: "0 14px", borderRadius: "var(--r-full)",
                  fontSize: "var(--t-secondary)", fontWeight: 600, cursor: "pointer",
                  background: yours === s ? "var(--gold)" : "transparent",
                  color: yours === s ? "var(--gold-ink)" : "var(--text-muted)",
                  border: yours === s ? "none" : "1px solid var(--border)",
                }}
              >
                {s === "GOING" ? "Going" : s === "MAYBE" ? "Maybe" : "Can't"}
              </button>
            ))}
            {!canRsvp && (
              <p className="t-rowmeta">Join the club to say you are coming.</p>
            )}
            {props.canStart && props.startable && (
              <button
                onClick={() => start(false)}
                disabled={busy}
                className="press"
                style={{ ...ghost, marginLeft: "auto", borderColor: "var(--border-gold)", color: "var(--gold)" }}
              >
                Start now
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const ghost: React.CSSProperties = {
  minHeight: 36,
  padding: "0 14px",
  borderRadius: "var(--r-full)",
  fontSize: "var(--t-secondary)",
  fontWeight: 600,
  cursor: "pointer",
  background: "transparent",
  color: "var(--text-muted)",
  border: "1px solid var(--border)",
};
