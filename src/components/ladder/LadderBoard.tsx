"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Flag } from "@/components/ui/Flag";
import { Icon } from "@/components/ui/Icon";
import type { Rung, LadderRules } from "@/lib/services/ladder";

/**
 * The ladder, as a column of rungs.
 *
 * The corkboard version worked because you could see your own name and
 * the three above it in one glance and know exactly who you were
 * allowed to play. That is the only thing this has to preserve: the
 * names you may challenge are marked, and everything else is quiet.
 */
export function LadderBoard({
  clubSlug,
  rungs,
  rules,
  meId,
  isMember,
}: {
  clubSlug: string;
  rungs: Rung[];
  rules: LadderRules;
  meId: string | null;
  isMember: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const mine = meId ? rungs.find((r) => r.userId === meId) ?? null : null;
  const onLadder = Boolean(mine);

  async function post(body: unknown, url: string, method = "POST") {
    setBusy(JSON.stringify(body));
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That did not work.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  if (rungs.length === 0) {
    return (
      <div
        style={{
          border: "1px dashed var(--border)", borderRadius: "var(--r-lg)",
          padding: "var(--s5) var(--s4)", textAlign: "center",
        }}
      >
        <p className="t-row" style={{ marginBottom: 4 }}>Nobody on the ladder yet</p>
        <p className="t-rowmeta" style={{ marginBottom: isMember ? "var(--s3)" : 0 }}>
          Climb it by challenging anyone up to{" "}
          <span className="digits">{rules.range}</span>{" "}
          {rules.range === 1 ? "rung" : "rungs"} above you.
        </p>
        {isMember && <JoinButton onClick={() => post({ action: "join" }, `/api/clubs/${clubSlug}/ladder`)} busy={busy !== null} />}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
      <div
        style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", overflow: "hidden",
        }}
      >
        {rungs.map((r, i) => {
          const isMe = r.userId === meId;
          const gap = mine ? mine.position - r.position : 0;
          const reachable = Boolean(mine) && gap > 0 && gap <= rules.range && !r.openChallenge && !mine?.openChallenge;

          return (
            <div
              key={r.userId}
              style={{
                display: "flex", alignItems: "center", gap: "var(--s3)",
                padding: "var(--s3) var(--s4)", minHeight: 58,
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
                background: isMe ? "var(--gold-wash)" : undefined,
              }}
            >
              <span
                className="digits"
                style={{
                  width: 26, flexShrink: 0, fontSize: 14, textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                  color: isMe ? "var(--text)" : "var(--text-dim)",
                  fontWeight: isMe ? 600 : 400,
                }}
              >
                {r.position}
              </span>

              <Avatar name={r.name} size={30} ring={r.position === 1} />

              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  className="t-row"
                  style={{ display: "block", overflowWrap: "break-word" }}
                >
                  {/* Inline flow, not flex: a flex row drops the flag
                      onto a line of its own the moment the name wraps.
                      break-word splits only a word that cannot fit at
                      all — "anywhere" cut "Olughsomething" in half. */}
                  {r.handle ? (
                    <Link
                      href={`/profile/${r.handle}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      <NameWithFlag name={r.name} country={r.country} />
                    </Link>
                  ) : (
                    <NameWithFlag name={r.name} country={r.country} />
                  )}
                </span>
                {r.openChallenge && (
                  // Wraps rather than truncating: "challenged by…" is
                  // the one line you need in order to answer, and the
                  // Accept button squeezes exactly this row narrowest.
                  <span
                    className="t-rowmeta"
                    style={{ display: "block", overflowWrap: "break-word" }}
                  >
                    {r.openChallenge.state === "ACCEPTED"
                      ? "playing "
                      : r.openChallenge.role === "defender"
                        ? "challenged by "
                        : "challenging "}
                    {r.openChallenge.otherName}
                  </span>
                )}
              </span>

              {reachable && (
                <button
                  onClick={() =>
                    post({ action: "challenge", defenderId: r.userId }, `/api/clubs/${clubSlug}/ladder`)
                  }
                  disabled={busy !== null}
                  className="press"
                  style={{
                    flexShrink: 0, minHeight: 30, padding: "0 9px", marginLeft: -2,
                    borderRadius: "var(--r-full)", cursor: "pointer",
                    background: "transparent", border: "1px solid var(--border-gold)",
                    color: "var(--gold)", fontSize: 12, fontWeight: 600,
                    letterSpacing: "0.01em", whiteSpace: "nowrap",
                  }}
                >
                  Challenge
                </button>
              )}

              {/* Only while it is still OPEN. An ACCEPTED challenge
                  has nothing left to accept, and offering the button
                  anyway sent the member into a server refusal. */}
              {isMe && mine?.openChallenge?.role === "defender" && mine.openChallenge.state === "OPEN" && (
                <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() =>
                      post({ action: "accept" }, `/api/ladder/challenges/${mine.openChallenge!.id}`, "PATCH")
                    }
                    disabled={busy !== null}
                    className="press"
                    style={{
                      minHeight: 32, padding: "0 12px", borderRadius: "var(--r-full)",
                      border: "none", background: "var(--gold)", color: "var(--gold-ink)",
                      fontSize: "var(--t-caption)", fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() =>
                      post({ action: "decline" }, `/api/ladder/challenges/${mine.openChallenge!.id}`, "PATCH")
                    }
                    disabled={busy !== null}
                    aria-label="Decline"
                    className="press"
                    style={{
                      width: 32, height: 32, borderRadius: "var(--r-full)",
                      display: "grid", placeItems: "center", cursor: "pointer",
                      background: "transparent", border: "1px solid var(--border)",
                      color: "var(--text-dim)",
                    }}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* The game has been agreed. This is the step that was missing:
          two people accepted a challenge and the board gave them
          nowhere to say what happened, so the ladder never moved. */}
      {mine?.openChallenge?.state === "ACCEPTED" && (
        <div
          style={{
            background: "var(--surface)", border: "1px solid var(--border-gold)",
            borderRadius: "var(--r-lg)", padding: "var(--s3) var(--s4)",
          }}
        >
          <p className="t-row" style={{ marginBottom: 2 }}>
            You are playing {mine.openChallenge.otherName}
          </p>
          <p className="t-rowmeta" style={{ marginBottom: "var(--s3)" }}>
            {mine.openChallenge.role === "challenger"
              ? "Win and you take their rung. A draw leaves the ladder as it is."
              : "Hold the rung by winning or drawing."}
          </p>
          <div style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}>
            <ResultButton
              label="I won"
              primary
              busy={busy !== null}
              onClick={() =>
                post(
                  { action: "result", winnerId: meId },
                  `/api/ladder/challenges/${mine.openChallenge!.id}`,
                  "PATCH",
                )
              }
            />
            <ResultButton
              label="I lost"
              busy={busy !== null}
              onClick={() =>
                post(
                  { action: "result", winnerId: mine.openChallenge!.otherId },
                  `/api/ladder/challenges/${mine.openChallenge!.id}`,
                  "PATCH",
                )
              }
            />
            <ResultButton
              label="Draw"
              busy={busy !== null}
              onClick={() =>
                post(
                  { action: "result", winnerId: null },
                  `/api/ladder/challenges/${mine.openChallenge!.id}`,
                  "PATCH",
                )
              }
            />
          </div>
        </div>
      )}

      {error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {isMember && !onLadder && (
        <JoinButton
          onClick={() => post({ action: "join" }, `/api/clubs/${clubSlug}/ladder`)}
          busy={busy !== null}
        />
      )}
    </div>
  );
}

/**
 * A name with its flag, where the flag never ends up alone on a line.
 *
 * Tuning widths cannot fix this: whatever the column width, some name
 * ends exactly one flag short of the edge. Binding the last word and
 * the flag into one unbreakable unit fixes it at any width — the same
 * trick typesetters use to keep a widow off its own line.
 */
function NameWithFlag({ name, country }: { name: string; country: string | null }) {
  if (!country) return <>{name}</>;

  const cut = name.lastIndexOf(" ");
  const head = cut === -1 ? "" : name.slice(0, cut + 1);
  const tail = cut === -1 ? name : name.slice(cut + 1);

  return (
    <>
      {head}
      <span style={{ whiteSpace: "nowrap" }}>
        {tail}
        <span style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 6 }}>
          <Flag code={country} height={10} />
        </span>
      </span>
    </>
  );
}

function ResultButton({
  label,
  onClick,
  busy,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  busy: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="press"
      style={{
        minHeight: 38, padding: "0 14px", borderRadius: "var(--r-full)",
        cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
        fontSize: "var(--t-secondary)", fontWeight: 600, whiteSpace: "nowrap",
        border: primary ? "none" : "1px solid var(--border)",
        background: primary ? "var(--gold)" : "transparent",
        color: primary ? "var(--gold-ink)" : "var(--text-muted)",
      }}
    >
      {label}
    </button>
  );
}

function JoinButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="press"
      style={{
        alignSelf: "flex-start", minHeight: 38, padding: "0 16px",
        borderRadius: "var(--r-full)", border: "none", cursor: busy ? "default" : "pointer",
        background: "var(--gold)", color: "var(--gold-ink)",
        fontSize: "var(--t-secondary)", fontWeight: 600, opacity: busy ? 0.5 : 1,
      }}
    >
      {busy ? "Joining…" : "Join the ladder"}
    </button>
  );
}
