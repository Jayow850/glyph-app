"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Flag } from "@/components/ui/Flag";
import { Sheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/Icon";
import { RailMark, RAIL_LABEL, RAIL_COLOR, RAIL_ORDER, type RailKind } from "./RailMarks";

interface Watcher {
  id: string;
  name: string;
  handle: string;
  country: string | null;
  title: string | null;
  backing: string | null;
}

interface RailState {
  you: { isPlayer: boolean; backing: string | null };
  count: number;
  watchers: Watcher[];
  backing: { w: number; b: number };
  reactions: { id: string; kind: RailKind; at: number }[];
  finished: boolean;
}

interface ClubPulse {
  online: number;
  games: { id: string; white: string; black: string; moves: number; watching: number }[];
}

interface Whisper {
  id: string;
  userId: string;
  name: string;
  country: string | null;
  body: string;
  at: number;
}

/** A reaction, on its way up across the board edge. */
interface Floater {
  id: string;
  kind: RailKind;
  left: number;
}

/**
 * THE RAIL — the band under the board, and the reason GLYPH is a club
 * rather than another chess app.
 *
 * Four hundred years of chess has happened with people standing around
 * the board, and no app has ever digitised that. This is the attempt:
 * who is watching, what they are reacting to, which side they are
 * backing, and — hidden from the players until the game ends — what
 * they are actually saying about it.
 *
 * When nobody is watching it does not go black. It shows the club
 * instead. The space is never dead, because a dead space under the
 * board is what told you this was software.
 */
export function Rail({
  gameId,
  ply,
  whiteName,
  blackName,
  finished,
  revealSignal = 0,
}: {
  gameId: string;
  ply: number;
  whiteName: string;
  blackName: string;
  finished: boolean;
  /**
   * Bump this to throw the whisper thread open — the game-over sheet
   * uses it for "what the rail said". A signal rather than a
   * controlled prop, so the sheet does not have to own rail state it
   * knows nothing about.
   */
  revealSignal?: number;
}) {
  const [rail, setRail] = useState<RailState | null>(null);
  const [pulse, setPulse] = useState<ClubPulse | null>(null);
  const [sheet, setSheet] = useState<null | "watchers" | "whispers">(null);
  const [whispers, setWhispers] = useState<Whisper[]>([]);
  const [sealed, setSealed] = useState(true);
  const [canWhisper, setCanWhisper] = useState(false);
  const [draft, setDraft] = useState("");
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [cooling, setCooling] = useState(false);

  const seen = useRef<Set<string>>(new Set());

  const beat = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}/rail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "watch" }),
      });
      if (!res.ok) return;
      const data: RailState = await res.json();
      setRail(data);

      // Each matured reaction floats once, for whoever is here to see
      // it. A reaction that arrived before you did is not replayed.
      const fresh = data.reactions.filter((r) => !seen.current.has(r.id));
      fresh.forEach((r) => seen.current.add(r.id));
      if (fresh.length) {
        setFloaters((cur) => [
          ...cur,
          ...fresh.map((r) => ({ id: r.id, kind: r.kind, left: 8 + Math.random() * 78 })),
        ]);
      }
    } catch {
      /* the next beat catches up */
    }
  }, [gameId]);

  useEffect(() => {
    beat();
    const t = setInterval(beat, 6000);
    return () => {
      clearInterval(t);
      // Leave quietly, so the strip does not keep showing a ghost.
      navigator.sendBeacon?.(
        `/api/games/${gameId}/rail`,
        new Blob([JSON.stringify({ action: "leave" })], { type: "application/json" }),
      );
    };
  }, [beat, gameId]);

  // Floaters clean themselves up when their animation is done.
  useEffect(() => {
    if (floaters.length === 0) return;
    const t = setTimeout(() => setFloaters((cur) => cur.slice(1)), 2600);
    return () => clearTimeout(t);
  }, [floaters]);

  // Only fetch the club when there is nothing better to show.
  const empty = rail !== null && rail.count === 0;
  useEffect(() => {
    if (!empty || pulse) return;
    fetch("/api/clubs/pulse", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPulse(d))
      .catch(() => {});
  }, [empty, pulse]);

  const loadWhispers = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}/whisper`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setSealed(Boolean(data.sealed));
      setCanWhisper(Boolean(data.canWrite));
      setWhispers(data.whispers ?? []);
    } catch {
      /* leave what we had */
    }
  }, [gameId]);

  useEffect(() => { loadWhispers(); }, [loadWhispers, finished]);

  useEffect(() => {
    if (revealSignal > 0) { loadWhispers(); setSheet("whispers"); }
  }, [revealSignal, loadWhispers]);

  useEffect(() => {
    if (sheet !== "whispers") return;
    const t = setInterval(loadWhispers, 5000);
    return () => clearInterval(t);
  }, [sheet, loadWhispers]);

  async function react(kind: RailKind) {
    if (cooling) return;
    setCooling(true);
    setTimeout(() => setCooling(false), 2500);
    // Shown to the sender at once; the players get it late, by design.
    setFloaters((cur) => [...cur, { id: `me${Date.now()}`, kind, left: 8 + Math.random() * 78 }]);
    try {
      await fetch(`/api/games/${gameId}/rail`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ply }),
      });
    } catch {
      /* the cheer is lost; nothing breaks */
    }
  }

  async function back(side: "w" | "b" | null) {
    setRail((r) => (r ? { ...r, you: { ...r.you, backing: side } } : r));
    try {
      await fetch(`/api/games/${gameId}/rail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "back", side }),
      });
      beat();
    } catch {
      /* the next beat corrects it */
    }
  }

  async function sendWhisper() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try {
      await fetch(`/api/games/${gameId}/whisper`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      loadWhispers();
    } catch {
      setDraft(body);
    }
  }

  const isPlayer = rail?.you.isPlayer ?? false;
  const anyone = (rail?.count ?? 0) > 0;

  return (
    <div className="rail-strip">
      {/* Reactions crossing the board edge, above everything. */}
      <div className="rail-floats" aria-hidden="true">
        {floaters.map((f) => (
          <span key={f.id} className="rail-float" style={{ left: `${f.left}%`, color: RAIL_COLOR[f.kind] }}>
            <RailMark kind={f.kind} size={22} />
          </span>
        ))}
      </div>

      <div className="rail-row">
        {anyone ? (
          <>
            <button
              onClick={() => setSheet("watchers")}
              className="press"
              style={{ display: "flex", alignItems: "center", gap: 0, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              aria-label={`${rail!.count} watching`}
            >
              {rail!.watchers.slice(0, 5).map((w, i) => (
                <span key={w.id} style={{ marginLeft: i === 0 ? 0 : -9, display: "block" }}>
                  <Avatar name={w.name} size={24} />
                </span>
              ))}
              <span className="t-caption digits" style={{ color: "var(--text-muted)", marginLeft: 8, whiteSpace: "nowrap" }}>
                {rail!.count} watching
              </span>
            </button>

            {(rail!.backing.w > 0 || rail!.backing.b > 0) && (
              <span className="t-caption digits" style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                {rail!.backing.w}–{rail!.backing.b}
              </span>
            )}
          </>
        ) : (
          <Link
            href="/challenges"
            className="t-caption"
            style={{ color: "var(--text-muted)", textDecoration: "none", whiteSpace: "nowrap" }}
          >
            {pulse
              ? `${pulse.online} member${pulse.online === 1 ? "" : "s"} online · ${pulse.games.length} game${pulse.games.length === 1 ? "" : "s"} in progress`
              : " "}
          </Link>
        )}

        <div style={{ flex: 1 }} />

        {/* Spectators cheer. Players read the room and whisper nothing. */}
        {!isPlayer && !finished && (
          <div style={{ display: "flex", gap: 2 }}>
            {RAIL_ORDER.map((k) => (
              <button
                key={k}
                onClick={() => react(k)}
                disabled={cooling}
                aria-label={RAIL_LABEL[k]}
                title={RAIL_LABEL[k]}
                className="press"
                style={{
                  width: 32, height: 32, borderRadius: "var(--r-full)",
                  display: "grid", placeItems: "center",
                  background: "transparent", border: "1px solid var(--border)",
                  color: RAIL_COLOR[k], cursor: cooling ? "default" : "pointer",
                  opacity: cooling ? 0.4 : 1,
                }}
              >
                <RailMark kind={k} size={16} />
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setSheet("whispers")}
          className="press"
          aria-label="Whispers"
          style={{
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
            background: "transparent", border: "none", cursor: "pointer",
            color: "var(--text-muted)", padding: "0 0 0 var(--s2)",
          }}
        >
          <Icon name="chat" size={17} />
          {whispers.length > 0 && !sealed && (
            <span className="t-caption digits">{whispers.length}</span>
          )}
        </button>
      </div>

      <Sheet open={sheet === "watchers"} onClose={() => setSheet(null)} title="On the rail">
        <div style={{ paddingBottom: "var(--s4)" }}>
          {!isPlayer && (
            <div style={{ display: "flex", gap: "var(--s2)", marginBottom: "var(--s4)" }}>
              {([["w", whiteName], ["b", blackName]] as const).map(([side, name]) => {
                const on = rail?.you.backing === side;
                return (
                  <button
                    key={side}
                    onClick={() => back(on ? null : side)}
                    className="press"
                    style={{
                      flex: 1, minHeight: 44, borderRadius: "var(--r-md)",
                      fontSize: "var(--t-secondary)", fontWeight: 600, cursor: "pointer",
                      background: on ? "var(--gold)" : "var(--surface-2)",
                      color: on ? "var(--gold-ink)" : "var(--text)",
                      border: on ? "none" : "1px solid var(--border)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {on ? "Backing " : "Back "}{name}
                  </button>
                );
              })}
            </div>
          )}

          {(rail?.watchers ?? []).map((w) => (
            <Link
              key={w.id}
              href={`/profile/${w.handle}`}
              style={{
                display: "flex", alignItems: "center", gap: "var(--s3)",
                padding: "var(--s2) 0", textDecoration: "none", color: "inherit",
              }}
            >
              <Avatar name={w.name} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "var(--t-secondary)", fontWeight: 600 }}>{w.name}</span>
                  {w.country && <Flag code={w.country} height={11} />}
                </div>
                {w.backing && (
                  <p className="t-caption" style={{ color: "var(--gold)" }}>
                    backing {w.backing === "w" ? whiteName : blackName}
                  </p>
                )}
              </div>
            </Link>
          ))}

          {(rail?.watchers.length ?? 0) === 0 && (
            <p className="t-secondary" style={{ textAlign: "center", padding: "var(--s8) 0" }}>
              Nobody is watching yet.
            </p>
          )}
        </div>
      </Sheet>

      <Sheet open={sheet === "whispers"} onClose={() => setSheet(null)} title="The rail">
        <div style={{ paddingBottom: "var(--s4)" }}>
          {sealed ? (
            <p className="t-secondary" style={{ textAlign: "center", padding: "var(--s8) var(--s4)" }}>
              The rail is talking about this game. You will be able to read
              all of it when the game ends.
            </p>
          ) : (
            <>
              {whispers.length === 0 && (
                <p className="t-secondary" style={{ textAlign: "center", padding: "var(--s8) 0" }}>
                  {canWhisper ? "Say something. The players cannot see this." : "Nobody said anything."}
                </p>
              )}

              {whispers.map((w) => (
                <div key={w.id} style={{ display: "flex", gap: "var(--s3)", padding: "var(--s2) 0" }}>
                  <Avatar name={w.name} size={28} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span className="t-caption" style={{ fontWeight: 600 }}>{w.name}</span>
                      {w.country && <Flag code={w.country} height={10} />}
                    </div>
                    <p style={{ fontSize: "var(--t-secondary)" }}>{w.body}</p>
                  </div>
                </div>
              ))}

              {canWhisper && (
                <div style={{ display: "flex", gap: "var(--s2)", marginTop: "var(--s4)" }}>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sendWhisper(); }}
                    placeholder="The players cannot see this"
                    maxLength={300}
                    style={{
                      flex: 1, minHeight: 44, boxSizing: "border-box",
                      background: "var(--surface-2)", color: "var(--text)",
                      border: "1px solid var(--border)", borderRadius: "var(--r-md)",
                      padding: "0 var(--s3)", fontSize: "var(--t-body)", outline: "none",
                    }}
                  />
                  <button
                    onClick={sendWhisper}
                    className="press"
                    aria-label="Send"
                    style={{
                      width: 44, height: 44, borderRadius: "var(--r-md)",
                      display: "grid", placeItems: "center", border: "none",
                      background: "var(--gold)", color: "var(--gold-ink)", cursor: "pointer",
                    }}
                  >
                    <Icon name="send" size={18} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </Sheet>
    </div>
  );
}
