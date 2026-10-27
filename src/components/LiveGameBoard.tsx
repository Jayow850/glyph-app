"use client";

import { useState, useMemo, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Engine } from "@engine/game/engine";
import { PlayBoard } from "@/components/social/PlayBoard";
import { PieceMark } from "@/components/social/Pieces";
import { BoardThemePicker } from "@/components/social/BoardThemePicker";
import { GameChat } from "@/components/social/GameChat";
import { Sheet } from "@/components/ui/Sheet";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { GameOverSheet } from "@/components/game/GameOverSheet";
import { playForSan, playEnd, playMove, playLowTime, isMuted, setMuted } from "@/lib/sound";

const gridToX88 = (i: number) => (7 - Math.floor(i / 8)) * 16 + (i % 8);
const x88ToGrid = (s: number) => (7 - (s >> 4)) * 8 + (s & 7);

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

function frameFromFen(fen: string): string[] {
  return fen.split(" ")[0].split("/").map((r) => r.replace(/\d/g, (d) => ".".repeat(Number(d))));
}

function capturedFrom(frame: string[]) {
  const full: Record<string, number> = { P: 8, N: 2, B: 2, R: 2, Q: 1, p: 8, n: 2, b: 2, r: 2, q: 1 };
  const onBoard: Record<string, number> = {};
  frame.join("").split("").forEach((ch) => { if (ch !== ".") onBoard[ch] = (onBoard[ch] ?? 0) + 1; });
  const whiteLost: string[] = [], blackLost: string[] = [];
  for (const [piece, count] of Object.entries(full)) {
    const missing = count - (onBoard[piece] ?? 0);
    for (let i = 0; i < missing; i++) {
      (piece === piece.toUpperCase() ? whiteLost : blackLost).push(piece);
    }
  }
  return { whiteLost, blackLost };
}

function changedSquares(prev: string[], next: string[]): number[] {
  const a = prev.join(""), b = next.join("");
  if (a.length !== 64 || b.length !== 64) return [];
  const out: number[] = [];
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) out.push(i);
  return out.length > 4 ? [] : out;
}

function buildPgn(sans: string[], white: string, black: string, result: string) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  const headers = [
    `[Event "GLYPH game"]`, `[Date "${date}"]`,
    `[White "${white}"]`, `[Black "${black}"]`, `[Result "${result}"]`,
  ].join("\n");
  let body = "";
  sans.forEach((san, i) => {
    if (i % 2 === 0) body += `${i / 2 + 1}. `;
    body += san + " ";
  });
  return `${headers}\n\n${body.trim()} ${result}`;
}

function formatClock(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  // Tenths once it is genuinely tight. A full minute of flickering
  // decimals is noise; both big sites show them in the last seconds.
  if (total < 20) return `${Math.floor(total)}.${Math.floor((total % 1) * 10)}`;
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function Clock({ ms, running, idle, increment }: { ms: number; running: boolean; idle: boolean; increment: number }) {
  const low = ms <= 30_000;
  const urgent = ms <= 10_000 && running;

  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5, flexShrink: 0 }}>
      <span
        className={`digits${urgent ? " clock-urgent" : ""}`}
        style={{
          fontSize: 26, fontWeight: 600, padding: "6px 13px", borderRadius: "var(--r-md)",
          minWidth: 104, textAlign: "center",
          background: running ? (low ? "var(--danger-solid)" : "var(--gold-wash)") : "transparent",
          color: running ? (low ? "#FFEFEF" : "var(--gold)") : low && !idle ? "var(--danger)" : "var(--text-muted)",
          border: `1px solid ${running ? (low ? "var(--danger-solid)" : "var(--gold)") : "var(--border)"}`,
          transition: "background 200ms var(--ease), color 200ms var(--ease), border-color 200ms var(--ease)",
        }}
      >
        {formatClock(ms)}
      </span>
      {increment > 0 && (
        <span className="digits" style={{ fontSize: 11, color: "var(--text-dim)" }}>+{increment / 1000}</span>
      )}
    </div>
  );
}

function PlayerBar({
  name, rating, country, title, delta, captured, advantage, ms, running, idle, increment,
}: {
  name: string; rating: string; country?: string | null; title?: string | null;
  delta: number | null; captured: string[]; advantage: number;
  ms: number; running: boolean; idle: boolean; increment: number;
}) {
  const hasTitle = Boolean(title) && title !== "NONE";

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "var(--s3)",
        padding: "var(--s2) var(--s3)", minHeight: 56, flexShrink: 0,
      }}
    >
      <Avatar name={name} size={36} ring={running} />

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {hasTitle && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "var(--gold)", color: "var(--gold-ink)", flexShrink: 0 }}>
              {title}
            </span>
          )}
          <span style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </span>
          {country && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", padding: "1px 5px", borderRadius: 4, background: "var(--surface-2)", color: "var(--text-muted)", flexShrink: 0 }}>
              {country.toUpperCase()}
            </span>
          )}
          <span className="digits" style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>{rating}</span>
          {delta !== null && (
            <span className="digits" style={{ fontSize: 12, fontWeight: 700, flexShrink: 0, color: delta > 0 ? "var(--success)" : delta < 0 ? "var(--danger)" : "var(--text-muted)" }}>
              {delta > 0 ? "+" : ""}{delta}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 1, minHeight: 16, flexWrap: "wrap" }}>
          {captured.map((p, i) => <PieceMark key={i} code={p} size={14} />)}
          {advantage > 0 && (
            <span className="digits" style={{ fontSize: 12, marginLeft: 5, color: "var(--gold)", fontWeight: 600 }}>+{advantage}</span>
          )}
        </div>
      </div>

      <Clock ms={ms} running={running} idle={idle} increment={increment} />
    </div>
  );
}

function ActionButton({
  icon, label, onClick, tone = "normal", badge,
}: {
  icon: IconName; label: string; onClick: () => void; tone?: "normal" | "danger"; badge?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="press tap"
      style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 3, background: "transparent", border: "none", cursor: "pointer", position: "relative",
        color: tone === "danger" ? "var(--danger)" : "var(--text-muted)",
      }}
    >
      <Icon name={icon} size={20} />
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.02em" }}>{label}</span>
      {badge && (
        <span style={{ position: "absolute", top: 4, right: "28%", width: 7, height: 7, borderRadius: "50%", background: "var(--gold)" }} />
      )}
    </button>
  );
}

interface ServerState {
  fen: string; sans: string[]; status: string; result: string | null;
  endReason?: string | null; whiteMs: number; blackMs: number;
  ticking?: boolean; drawOfferBy?: "w" | "b" | null;
  whiteRatingDelta?: number | null; blackRatingDelta?: number | null;
}

export function LiveGameBoard({
  gameId, youId, initialFen, initialSans, youAre, whiteName, blackName,
  whiteRating, blackRating, whiteCountry, blackCountry, whiteTitle, blackTitle,
  status: initialStatus, result: initialResult, endReason: initialEndReason,
  initialWhiteMs, initialBlackMs, initialDrawOfferBy, initialTicking,
  initialWhiteDelta, initialBlackDelta, rated, timeControl, speedLabel, incrementMs,
}: {
  gameId: string; youId: string | null; initialFen: string; initialSans: string[];
  youAre: "w" | "b" | null; whiteName: string; blackName: string;
  whiteRating: string; blackRating: string;
  whiteCountry?: string | null; blackCountry?: string | null;
  whiteTitle?: string | null; blackTitle?: string | null;
  status: string; result: string | null; endReason: string | null;
  initialWhiteMs: number; initialBlackMs: number;
  initialDrawOfferBy: "w" | "b" | null;
  initialTicking: boolean;
  initialWhiteDelta: number | null; initialBlackDelta: number | null;
  rated: boolean; timeControl: string; speedLabel: string; incrementMs: number;
}) {
  const [fen, setFen] = useState(initialFen);
  const [sans, setSans] = useState<string[]>(initialSans);
  const [status, setStatus] = useState(initialStatus);
  const [result, setResult] = useState<string | null>(initialResult);
  const [endReason, setEndReason] = useState<string | null>(initialEndReason);
  const [whiteMs, setWhiteMs] = useState(initialWhiteMs);
  const [blackMs, setBlackMs] = useState(initialBlackMs);
  const [ticking, setTicking] = useState(initialTicking);
  const [drawOfferBy, setDrawOfferBy] = useState<"w" | "b" | null>(initialDrawOfferBy);
  const [whiteDelta, setWhiteDelta] = useState<number | null>(initialWhiteDelta);
  const [blackDelta, setBlackDelta] = useState<number | null>(initialBlackDelta);

  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [rematchState, setRematchState] = useState<"idle" | "sent" | "accepted">("idle");

  const [sheet, setSheet] = useState<null | "moves" | "chat" | "settings">(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [coordsOn, setCoordsOn] = useState(true);
  const [flipOverride, setFlipOverride] = useState<boolean | null>(null);
  const [soundOff, setSoundOff] = useState(false);

  const router = useRouter();
  const prevFrameRef = useRef<string[]>(frameFromFen(initialFen));
  const moveCountRef = useRef<number>(initialSans.length);
  const statusRef = useRef<string>(initialStatus);

  useEffect(() => setSoundOff(isMuted()), []);

  const live = status === "ACTIVE";
  const engine = useMemo(() => new Engine(fen), [fen]);
  const legal = useMemo(() => engine.legalMoves(), [engine]);
  const turn = engine.turn;
  const myTurn = youAre !== null && turn === youAre && live;
  const flipped = flipOverride !== null ? flipOverride : youAre === "b";

  const frame = frameFromFen(fen);

  const checkSquare = useMemo(() => {
    if (!engine.inCheck()) return null;
    const board = fen.split(" ")[0].split("/").map((r) => r.replace(/\d/g, (d) => ".".repeat(Number(d)))).join("");
    const idx = board.indexOf(turn === "w" ? "K" : "k");
    return idx === -1 ? null : idx;
  }, [engine, turn, fen]);

  const applyState = useCallback((data: ServerState) => {
    const nextFrame = frameFromFen(data.fen);
    const touched = changedSquares(prevFrameRef.current, nextFrame);
    if (touched.length) setLastMove(touched);
    prevFrameRef.current = nextFrame;

    if (data.sans.length > moveCountRef.current) playForSan(data.sans[data.sans.length - 1] ?? "");
    moveCountRef.current = data.sans.length;

    if (data.status !== "ACTIVE" && statusRef.current === "ACTIVE") {
      const won =
        data.result === "1/2-1/2" || youAre === null ? null
        : (youAre === "w" && data.result === "1-0") || (youAre === "b" && data.result === "0-1");
      playEnd(won);
    }
    statusRef.current = data.status;

    setFen(data.fen);
    setSans(data.sans);
    setStatus(data.status);
    setResult(data.result);
    setEndReason(data.endReason ?? null);
    setWhiteMs(data.whiteMs);
    setBlackMs(data.blackMs);
    setTicking(data.ticking ?? true);
    setDrawOfferBy(data.drawOfferBy ?? null);
    if (data.whiteRatingDelta !== undefined) setWhiteDelta(data.whiteRatingDelta);
    if (data.blackRatingDelta !== undefined) setBlackDelta(data.blackRatingDelta);
  }, [youAre]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/games/${gameId}/state`, { cache: "no-store" });
        if (!res.ok) return;
        const data: ServerState = await res.json();
        const moved = data.fen !== fen;
        const ended = data.status !== status;
        applyState(data);
        if (moved || ended) router.refresh();
      } catch {
        /* the next poll catches up */
      }
    }, 2500);
    return () => clearInterval(t);
  }, [gameId, fen, status, live, applyState, router]);

  // Local countdown between polls, display only. Nothing moves until
  // White has actually started the game.
  useEffect(() => {
    if (!live || !ticking) return;
    const t = setInterval(() => {
      if (turn === "w") setWhiteMs((ms) => Math.max(0, ms - 100));
      else setBlackMs((ms) => Math.max(0, ms - 100));
    }, 100);
    return () => clearInterval(t);
  }, [turn, live, ticking]);

  const warned = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!live || !ticking || youAre === null) return;
    const mine = youAre === "w" ? whiteMs : blackMs;
    for (const threshold of [30_000, 10_000]) {
      if (mine <= threshold && !warned.current.has(threshold)) {
        warned.current.add(threshold);
        playLowTime();
      }
    }
  }, [whiteMs, blackMs, live, ticking, youAre]);

  const targets = useMemo(() => {
    if (selected === null || !myTurn) return [];
    const from88 = gridToX88(selected);
    return legal.filter((m) => m.from === from88).map((m) => x88ToGrid(m.to));
  }, [selected, legal, myTurn]);

  const { whiteLost, blackLost } = capturedFrom(frame);
  const scoreFor = (lost: string[]) => lost.reduce((s, p) => s + (VALUE[p.toLowerCase()] ?? 0), 0);
  const edge = scoreFor(whiteLost) - scoreFor(blackLost);

  async function handleSquare(idx: number) {
    if (!myTurn || busy) return;

    if (selected !== null && targets.includes(idx)) {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/games/${gameId}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: selected, to: idx, promotion: "q", seq: sans.length }),
        });
        const data = await res.json();
        setSelected(null);
        if (res.ok) { applyState(data); router.refresh(); }
        else if (data.error === "flagged") { applyState(data); setError("Your flag fell."); }
        else setError(data.error === "stale_seq" ? "The position moved on — retry." : "That move was rejected.");
      } catch {
        setError("Could not reach the server.");
      } finally {
        setBusy(false);
      }
      return;
    }

    const from88 = gridToX88(idx);
    setSelected(legal.some((m) => m.from === from88) ? idx : null);
  }

  async function post(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/games/${gameId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (res.ok) { applyState(data); router.refresh(); }
      else setError("That didn't go through.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function rematch() {
    setBusy(true);
    try {
      const res = await fetch(`/api/games/${gameId}/rematch`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setRematchState(data.theirs ? "accepted" : "sent");
        router.refresh();
      } else setError("Could not offer a rematch.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function postGame() {
    setPosting(true);
    const pgn = buildPgn(sans, whiteName, blackName, result ?? "*");
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "GAME", body: defaultCaption, pgn }),
    });
    setPosting(false);
    if (res.ok) setPosted(true);
  }

  const opponent = youAre === "w" ? blackName : whiteName;
  const youWon = (youAre === "w" && result === "1-0") || (youAre === "b" && result === "0-1");
  const defaultCaption =
    result === "1/2-1/2" ? `Drew with ${opponent}.`
    : youWon ? `Beat ${opponent}. ♟`
    : `Lost to ${opponent}. Good game.`;

  const topIsWhite = flipped;
  const bar = (isWhite: boolean) => ({
    name: isWhite ? whiteName : blackName,
    rating: isWhite ? whiteRating : blackRating,
    country: isWhite ? whiteCountry : blackCountry,
    title: isWhite ? whiteTitle : blackTitle,
    delta: isWhite ? whiteDelta : blackDelta,
    captured: isWhite ? blackLost : whiteLost,
    advantage: isWhite ? -edge : edge,
    ms: isWhite ? whiteMs : blackMs,
    running: live && ticking && turn === (isWhite ? "w" : "b"),
    idle: !ticking,
    increment: incrementMs,
  });

  const theirOffer = drawOfferBy !== null && youAre !== null && drawOfferBy !== youAre;
  const yourOffer = drawOfferBy !== null && drawOfferBy === youAre;
  const canAbort = live && youAre !== null && sans.length < 2;

  const movePairs: { n: number; w?: string; b?: string }[] = [];
  sans.forEach((san, i) => {
    const n = Math.floor(i / 2);
    if (!movePairs[n]) movePairs[n] = { n: n + 1 };
    if (i % 2 === 0) movePairs[n].w = san; else movePairs[n].b = san;
  });

  const btn = (primary: boolean): CSSProperties => ({
    flex: 1, borderRadius: "var(--r-md)", padding: "11px 0", fontWeight: 600, fontSize: 14,
    border: primary ? "none" : "1px solid var(--border)",
    background: primary ? "var(--gold)" : "var(--surface)",
    color: primary ? "var(--gold-ink)" : "var(--text)",
    cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
  });

  const MoveList = (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))" }}>
      {movePairs.map((p) => (
        <div key={p.n} className="digits" style={{ display: "flex", gap: 8, padding: "5px 2px", fontSize: 14 }}>
          <span style={{ color: "var(--text-dim)", minWidth: 20 }}>{p.n}.</span>
          <span style={{ minWidth: 46 }}>{p.w}</span>
          <span style={{ color: "var(--text-muted)" }}>{p.b ?? ""}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="gameroom ingame">
      <div className="gameroom-board">
        {/* Slim game header — mobile only; the app bar is hidden in-game. */}
        <div
          className="game-header"
          style={{
            display: "flex", alignItems: "center", gap: "var(--s2)",
            height: 44, padding: "0 var(--s2)", flexShrink: 0,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Link href="/challenges" aria-label="Back" className="tap press" style={{ display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
            </svg>
          </Link>

          <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              vs {opponent}
            </p>
            <p className="t-caption digits" style={{ color: "var(--text-muted)", lineHeight: 1.1 }}>
              {speedLabel} · {timeControl} · {rated ? "rated" : "casual"}
            </p>
          </div>

          <button
            onClick={() => setSheet("settings")}
            aria-label="Game settings"
            className="tap press"
            style={{ background: "transparent", border: "none", color: "var(--text-muted)", display: "grid", placeItems: "center", cursor: "pointer" }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
              <circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" />
            </svg>
          </button>
        </div>

        <PlayerBar {...bar(topIsWhite)} />

        <div className="board-slot">
          <div className={`board-fit${myTurn ? " yours" : ""}`}>
            <PlayBoard
              frame={frame}
              selected={selected}
              targets={targets}
              lastMove={lastMove}
              onSquare={handleSquare}
              flipped={flipped}
              checkSquare={checkSquare}
              coords={coordsOn}
              disabled={!myTurn}
            />
          </div>
        </div>

        <PlayerBar {...bar(!topIsWhite)} />

        {/* A draw offer is a slim banner, never a dialogue over a running clock. */}
        {theirOffer && live && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: "var(--s2)", flexShrink: 0,
              padding: "var(--s2) var(--s3)", background: "var(--gold-wash)",
              borderTop: "1px solid var(--gold)",
            }}
          >
            <p style={{ flex: 1, fontSize: 14 }}>{opponent} offers a draw.</p>
            <button onClick={() => post("draw", { action: "accept" })} disabled={busy} className="press" style={{ ...btn(true), flex: "0 0 auto", padding: "8px 16px" }}>Accept</button>
            <button onClick={() => post("draw", { action: "decline" })} disabled={busy} className="press" style={{ ...btn(false), flex: "0 0 auto", padding: "8px 16px" }}>Decline</button>
          </div>
        )}

        {error && (
          <p style={{ flexShrink: 0, color: "var(--danger)", fontSize: 13, padding: "0 var(--s3) var(--s1)" }}>{error}</p>
        )}

        {/* Action bar — compact icons, not full-width buttons. */}
        <div
          className="game-actions"
          style={{
            display: "flex", alignItems: "stretch", height: 54, flexShrink: 0,
            borderTop: "1px solid var(--border)", background: "var(--surface)",
          }}
        >
          {live && youAre ? (
            <>
              {canAbort ? (
                <ActionButton icon="x" label="Abort" tone="danger" onClick={() => post("abort")} />
              ) : (
                <ActionButton icon="x" label="Resign" tone="danger" onClick={() => setConfirmResign(true)} />
              )}
              <ActionButton icon="check" label={yourOffer ? "Offered" : "Draw"} onClick={() => post("draw", { action: "offer" })} />
            </>
          ) : (
            <ActionButton icon="swords" label="Rematch" onClick={rematch} />
          )}
          <ActionButton icon="clock" label="Moves" onClick={() => setSheet("moves")} />
          <ActionButton icon="users" label="Chat" onClick={() => setSheet("chat")} />
        </div>
      </div>

      {/* Desktop keeps everything beside the board — there is room for it. */}
      <div className="gameroom-panel">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
          <p style={{ flex: 1, fontSize: 16, fontWeight: 600, color: live ? "var(--gold)" : "var(--text)" }}>
            {live ? (myTurn ? "Your move" : `Waiting for ${turn === "w" ? whiteName : blackName}`) : (result ?? "Finished")}
          </p>
          <BoardThemePicker />
        </div>

        {live && youAre && (
          <div style={{ display: "flex", gap: "var(--s3)" }}>
            {confirmResign ? (
              <>
                <button onClick={() => { setConfirmResign(false); post("resign"); }} disabled={busy} className="press" style={{ ...btn(false), background: "var(--danger-solid)", color: "#FFEFEF", border: "none" }}>Confirm resign</button>
                <button onClick={() => setConfirmResign(false)} className="press" style={btn(false)}>Keep playing</button>
              </>
            ) : (
              <>
                {canAbort
                  ? <button onClick={() => post("abort")} disabled={busy} className="press" style={btn(false)}>Abort</button>
                  : <button onClick={() => setConfirmResign(true)} disabled={busy} className="press" style={btn(false)}>Resign</button>}
                <button onClick={() => post("draw", { action: "offer" })} disabled={busy || yourOffer} className="press" style={btn(false)}>
                  {yourOffer ? "Draw offered" : "Offer draw"}
                </button>
              </>
            )}
          </div>
        )}

        <div className="card" style={{ padding: "var(--s4)" }}>
          <p className="section-label" style={{ marginBottom: "var(--s2)" }}>Moves</p>
          {sans.length === 0 ? <div style={{ height: 8 }} /> : MoveList}
        </div>

        <GameChat gameId={gameId} youId={youId} canWrite={youAre !== null} finished={!live} />
      </div>

      {/* ---- sheets ---- */}

      <Sheet open={sheet === "moves"} onClose={() => setSheet(null)} title="Moves">
        {sans.length === 0 ? <div style={{ height: 24 }} /> : MoveList}
      </Sheet>

      <Sheet open={sheet === "chat"} onClose={() => setSheet(null)} title="Chat">
        <GameChat gameId={gameId} youId={youId} canWrite={youAre !== null} finished={!live} />
      </Sheet>

      <Sheet open={sheet === "settings"} onClose={() => setSheet(null)} title="Board settings">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s5)", paddingBottom: "var(--s4)" }}>
          <div>
            <p className="section-label" style={{ marginBottom: "var(--s2)" }}>Board</p>
            <BoardThemePicker />
          </div>

          <SettingRow
            label="Sound"
            on={!soundOff}
            onToggle={() => { const next = !soundOff; setMuted(next); setSoundOff(next); if (!next) playMove(); }}
          />
          <SettingRow label="Coordinates" on={coordsOn} onToggle={() => setCoordsOn((v) => !v)} />
          <SettingRow
            label="Flip board"
            on={flipped}
            onToggle={() => setFlipOverride(!flipped)}
          />
        </div>
      </Sheet>

      {confirmResign && (
        <Sheet open onClose={() => setConfirmResign(false)} title="Resign this game?">
          <p className="t-secondary" style={{ marginTop: "calc(-1 * var(--s2))", marginBottom: "var(--s4)" }}>
            {rated ? "This counts as a loss and will move your rating." : "This counts as a loss."}
          </p>
          <div style={{ display: "flex", gap: "var(--s3)", paddingBottom: "var(--s4)" }}>
            <button
              onClick={() => { setConfirmResign(false); post("resign"); }}
              className="press"
              style={{ ...btn(false), minHeight: 48, background: "var(--danger-solid)", color: "#FFEFEF", border: "none" }}
            >
              Resign
            </button>
            <button onClick={() => setConfirmResign(false)} className="press" style={{ ...btn(false), minHeight: 48 }}>
              Keep playing
            </button>
          </div>
        </Sheet>
      )}

      <GameOverSheet
        open={!live && !resultDismissed}
        onClose={() => setResultDismissed(true)}
        youAre={youAre}
        result={result}
        endReason={endReason}
        whiteName={whiteName}
        blackName={blackName}
        whiteRating={whiteRating}
        blackRating={blackRating}
        whiteDelta={whiteDelta}
        blackDelta={blackDelta}
        rated={rated}
        onRematch={rematch}
        onShare={postGame}
        shared={posted || posting}
        busy={busy}
      />

      {rematchState !== "idle" && (
        <p style={{ position: "fixed", bottom: 70, left: 0, right: 0, textAlign: "center", fontSize: 13, color: "var(--gold)", zIndex: 70 }}>
          {rematchState === "accepted" ? `${opponent} already offered — check Games.` : `Rematch offered to ${opponent}.`}
        </p>
      )}
    </div>
  );
}

function SettingRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      className="press"
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", minHeight: 48, background: "transparent", border: "none",
        color: "var(--text)", fontSize: "var(--t-body)", cursor: "pointer", padding: 0,
      }}
    >
      {label}
      <span
        style={{
          width: 46, height: 28, borderRadius: 14, flexShrink: 0, position: "relative",
          background: on ? "var(--gold)" : "var(--surface-2)",
          border: `1px solid ${on ? "var(--gold)" : "var(--border)"}`,
          transition: "background 160ms var(--ease)",
        }}
      >
        <span
          style={{
            position: "absolute", top: 2, left: on ? 20 : 2,
            width: 22, height: 22, borderRadius: "50%",
            background: on ? "var(--gold-ink)" : "var(--text-muted)",
            transition: "left 160ms var(--ease)",
          }}
        />
      </span>
    </button>
  );
}
