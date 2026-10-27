"use client";

import { useState, useMemo, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Engine } from "@engine/game/engine";
import { PlayBoard } from "@/components/social/PlayBoard";
import { PieceMark } from "@/components/social/Pieces";
import { BoardThemePicker } from "@/components/social/BoardThemePicker";
import { GameChat } from "@/components/social/GameChat";
import { playForSan, playEnd, playMove, playLowTime, isMuted, setMuted } from "@/lib/sound";

const gridToX88 = (i: number) => (7 - Math.floor(i / 8)) * 16 + (i % 8);
const x88ToGrid = (s: number) => (7 - (s >> 4)) * 8 + (s & 7);

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

const GOLD = "#D4AF37";
const LOSS = "#B0575A";
const WIN = "#7FB069";
const RAISED = "#16161A";
const EDGE = "rgba(212,175,55,0.08)";

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
    `[Event "GLYPH game"]`,
    `[Date "${date}"]`,
    `[White "${white}"]`,
    `[Black "${black}"]`,
    `[Result "${result}"]`,
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
  if (total < 20) return `${Math.floor(total)}.${Math.floor((total % 1) * 10)}`;
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const AVATAR_TINTS = ["#5E7A63", "#9A6A43", "#58627A", "#7A5E6E", "#4A6B78", "#6E6A45"];
function tintFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

function SoundToggle() {
  const [off, setOff] = useState(false);
  useEffect(() => setOff(isMuted()), []);

  return (
    <button
      onClick={() => {
        const next = !off;
        setMuted(next);
        setOff(next);
        if (!next) playMove(); // confirm it came back on
      }}
      aria-label={off ? "Turn sound on" : "Turn sound off"}
      aria-pressed={!off}
      title={off ? "Sound off" : "Sound on"}
      style={{
        width: 30, height: 26, display: "grid", placeItems: "center",
        background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 7, cursor: "pointer", color: off ? "#6E6E78" : GOLD, padding: 0,
      }}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4z" />
        {off
          ? <path d="M17 9l4 6M21 9l-4 6" />
          : <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 6a9 9 0 0 1 0 12" /></>}
      </svg>
    </button>
  );
}

function Clock({ ms, running, idle }: { ms: number; running: boolean; idle: boolean }) {
  const low = ms <= 30_000;
  return (
    <span
      className="digits"
      style={{
        fontSize: 25,
        fontWeight: 600,
        padding: "7px 14px",
        borderRadius: 10,
        minWidth: 102,
        textAlign: "center",
        flexShrink: 0,
        background: running ? (low ? "#8E3B3E" : GOLD) : "#101013",
        color: running ? (low ? "#FFEFEF" : "#0D0D0F") : low && !idle ? "#C98184" : "#8A8A93",
        border: running ? "none" : "1px solid rgba(255,255,255,0.07)",
        boxShadow: running
          ? `0 4px 18px ${low ? "rgba(142,59,62,0.35)" : "rgba(212,175,55,0.28)"}`
          : "inset 0 1px 0 rgba(255,255,255,0.03)",
        transition: "background 200ms, color 200ms, box-shadow 200ms",
      }}
    >
      {formatClock(ms)}
    </span>
  );
}

function PlayerCard({
  name, side, rating, delta, captured, advantage, ms, running, idle,
}: {
  name: string; side: "White" | "Black"; rating: string; delta: number | null;
  captured: string[]; advantage: number; ms: number; running: boolean; idle: boolean;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12,
        background: RAISED,
        border: `1px solid ${running ? "rgba(212,175,55,0.28)" : EDGE}`,
        borderRadius: 14,
        padding: "10px 12px",
        transition: "border-color 200ms",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          display: "grid", placeItems: "center",
          background: tintFor(name),
          color: "#F5F1E8", fontSize: 15, fontWeight: 600,
          boxShadow: running ? `0 0 0 2px ${GOLD}` : "none",
          transition: "box-shadow 200ms",
        }}
      >
        {initials(name)}
      </span>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
          <p style={{ fontSize: 16, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </p>
          <span className="digits" style={{ fontSize: 13, color: "#8A8A93", flexShrink: 0 }}>{rating}</span>
          {delta !== null && (
            <span
              className="digits"
              style={{ fontSize: 13, fontWeight: 600, flexShrink: 0, color: delta > 0 ? WIN : delta < 0 ? LOSS : "#8A8A93" }}
            >
              {delta > 0 ? "+" : ""}{delta}
            </span>
          )}
          <span className="section-label" style={{ flexShrink: 0 }}>{side}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 1, minHeight: 17, flexWrap: "wrap" }}>
          {captured.map((p, i) => <PieceMark key={i} code={p} size={15} />)}
          {advantage > 0 && (
            <span className="digits" style={{ fontSize: 13, marginLeft: 6, color: GOLD, fontWeight: 600 }}>
              +{advantage}
            </span>
          )}
        </div>
      </div>

      <Clock ms={ms} running={running} idle={idle} />
    </div>
  );
}

interface ServerState {
  fen: string;
  sans: string[];
  status: string;
  result: string | null;
  endReason?: string | null;
  whiteMs: number;
  blackMs: number;
  ticking?: boolean;
  drawOfferBy?: "w" | "b" | null;
  whiteRatingDelta?: number | null;
  blackRatingDelta?: number | null;
}

const REASON_TEXT: Record<string, string> = {
  checkmate: "by checkmate",
  resign: "by resignation",
  timeout: "on time",
  timeout_vs_insufficient: "on time, insufficient material",
  draw_agreed: "by agreement",
  stalemate: "by stalemate",
  fifty: "by the fifty-move rule",
  threefold: "by threefold repetition",
  material: "— insufficient material",
};

export function LiveGameBoard({
  gameId, youId, initialFen, initialSans, youAre, whiteName, blackName,
  whiteRating, blackRating,
  status: initialStatus, result: initialResult, endReason: initialEndReason,
  initialWhiteMs, initialBlackMs, initialDrawOfferBy, initialTicking,
  initialWhiteDelta, initialBlackDelta, rated, timeControl, speedLabel,
}: {
  gameId: string; youId: string | null; initialFen: string; initialSans: string[];
  youAre: "w" | "b" | null; whiteName: string; blackName: string;
  whiteRating: string; blackRating: string;
  status: string; result: string | null; endReason: string | null;
  initialWhiteMs: number; initialBlackMs: number;
  initialDrawOfferBy: "w" | "b" | null;
  initialTicking: boolean;
  initialWhiteDelta: number | null; initialBlackDelta: number | null;
  rated: boolean;
  timeControl: string;
  speedLabel: string;
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
  const [caption, setCaption] = useState("");
  const [rematchState, setRematchState] = useState<"idle" | "sent" | "accepted">("idle");

  const router = useRouter();
  const prevFrameRef = useRef<string[]>(frameFromFen(initialFen));
  const moveCountRef = useRef<number>(initialSans.length);
  const statusRef = useRef<string>(initialStatus);

  const live = status === "ACTIVE";
  const engine = useMemo(() => new Engine(fen), [fen]);
  const legal = useMemo(() => engine.legalMoves(), [engine]);
  const turn = engine.turn;
  const myTurn = youAre !== null && turn === youAre && live;
  const flipped = youAre === "b";

  const frame = frameFromFen(fen);

  const checkSquare = useMemo(() => {
    if (!engine.inCheck()) return null;
    const board = fen
      .split(" ")[0]
      .split("/")
      .map((r) => r.replace(/\d/g, (d) => ".".repeat(Number(d))))
      .join("");
    const idx = board.indexOf(turn === "w" ? "K" : "k");
    return idx === -1 ? null : idx;
  }, [engine, turn, fen]);

  const applyState = useCallback((data: ServerState) => {
    const nextFrame = frameFromFen(data.fen);
    const touched = changedSquares(prevFrameRef.current, nextFrame);
    if (touched.length) setLastMove(touched);
    prevFrameRef.current = nextFrame;

    // Sound: one per new move, and one when the game ends.
    if (data.sans.length > moveCountRef.current) {
      playForSan(data.sans[data.sans.length - 1] ?? "");
    }
    moveCountRef.current = data.sans.length;

    if (data.status === "FINISHED" && statusRef.current !== "FINISHED") {
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
        /* a dropped poll is harmless; the next one catches up */
      }
    }, 2500);
    return () => clearInterval(t);
  }, [gameId, fen, status, live, applyState, router]);

  // Local countdown between polls. Display only — and nothing moves
  // until White has actually started the game.
  useEffect(() => {
    if (!live || !ticking) return;
    const t = setInterval(() => {
      if (turn === "w") setWhiteMs((ms) => Math.max(0, ms - 100));
      else setBlackMs((ms) => Math.max(0, ms - 100));
    }, 100);
    return () => clearInterval(t);
  }, [turn, live, ticking]);

  // Low-time warning on your own clock, once per threshold.
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
        if (res.ok) {
          applyState(data);
          router.refresh();
        } else if (data.error === "flagged") {
          applyState(data);
          setError("Your flag fell.");
        } else {
          setError(data.error === "stale_seq" ? "The position moved on — retry." : "That move was rejected.");
        }
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
      if (res.ok) {
        applyState(data);
        router.refresh();
      } else {
        setError("That didn't go through.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function rematch() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/games/${gameId}/rematch`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setRematchState(data.theirs ? "accepted" : "sent");
        router.refresh();
      } else {
        setError("Could not offer a rematch.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function postGame() {
    setPosting(true);
    const pgn = buildPgn(sans, whiteName, blackName, result ?? "*");
    const body = caption.trim() || defaultCaption;
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "GAME", body, pgn }),
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

  const waitingToStart = live && !ticking && sans.length === 0;
  const turnName = turn === "w" ? whiteName : blackName;
  const statusText = !live
    ? `${result ?? "Finished"} ${endReason ? REASON_TEXT[endReason] ?? "" : ""}`.trim()
    : waitingToStart
      ? (youAre === "w" ? "Your move — the clock starts when you play" : `The clock starts on ${whiteName}'s first move`)
      : youAre === null ? `${turnName} to move`
      : myTurn ? (engine.inCheck() ? "Your move — you're in check" : "Your move")
      : `Waiting for ${turnName}`;

  const topIsWhite = flipped;
  const top = {
    name: topIsWhite ? whiteName : blackName,
    side: (topIsWhite ? "White" : "Black") as "White" | "Black",
    rating: topIsWhite ? whiteRating : blackRating,
    delta: topIsWhite ? whiteDelta : blackDelta,
    captured: topIsWhite ? blackLost : whiteLost,
    advantage: topIsWhite ? -edge : edge,
    ms: topIsWhite ? whiteMs : blackMs,
    running: live && ticking && turn === (topIsWhite ? "w" : "b"),
    idle: !ticking,
  };
  const bottom = {
    name: topIsWhite ? blackName : whiteName,
    side: (topIsWhite ? "Black" : "White") as "White" | "Black",
    rating: topIsWhite ? blackRating : whiteRating,
    delta: topIsWhite ? blackDelta : whiteDelta,
    captured: topIsWhite ? whiteLost : blackLost,
    advantage: topIsWhite ? edge : -edge,
    ms: topIsWhite ? blackMs : whiteMs,
    running: live && ticking && turn === (topIsWhite ? "b" : "w"),
    idle: !ticking,
  };

  const theirOffer = drawOfferBy !== null && youAre !== null && drawOfferBy !== youAre;
  const yourOffer = drawOfferBy !== null && drawOfferBy === youAre;

  const btn = (primary: boolean): CSSProperties => ({
    flex: 1, borderRadius: 12, padding: "11px 0", fontWeight: 600, fontSize: 14,
    border: primary ? "none" : "1px solid rgba(255,255,255,0.1)",
    background: primary ? GOLD : RAISED,
    color: primary ? "#0D0D0F" : "#B5B5BE",
    cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
  });

  const movePairs: { n: number; w?: string; b?: string }[] = [];
  sans.forEach((san, i) => {
    const n = Math.floor(i / 2);
    if (!movePairs[n]) movePairs[n] = { n: n + 1 };
    if (i % 2 === 0) movePairs[n].w = san; else movePairs[n].b = san;
  });

  return (
    <div className="gameroom">
      <div className="gameroom-board">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: live ? GOLD : "#F5F1E8", flex: 1, minWidth: 140 }}>
            {statusText}
          </p>
          <span className="digits section-label">
            {speedLabel} · {timeControl} · {rated ? "rated" : "casual"}
          </span>
          <BoardThemePicker />
          <SoundToggle />
        </div>

        <PlayerCard {...top} />

        <PlayBoard
          frame={frame}
          selected={selected}
          targets={targets}
          lastMove={lastMove}
          onSquare={handleSquare}
          flipped={flipped}
          checkSquare={checkSquare}
          disabled={!myTurn}
        />

        <PlayerCard {...bottom} />
      </div>

      <div className="gameroom-panel">
        {error && <p style={{ color: LOSS, fontSize: 14 }}>{error}</p>}

        {theirOffer && live && (
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: 14 }}>
            <p style={{ fontSize: 15, flex: 1, minWidth: 150 }}>{opponent} offers a draw.</p>
            <button onClick={() => post("draw", { action: "accept" })} disabled={busy} style={{ ...btn(true), flex: "0 0 auto", padding: "9px 18px" }}>Accept</button>
            <button onClick={() => post("draw", { action: "decline" })} disabled={busy} style={{ ...btn(false), flex: "0 0 auto", padding: "9px 18px" }}>Decline</button>
          </div>
        )}

        {yourOffer && live && (
          <p className="text-ivory-meta" style={{ fontSize: 14 }}>
            Draw offered — waiting for {opponent}.{" "}
            <button onClick={() => post("draw", { action: "decline" })} style={{ background: "none", border: "none", color: GOLD, cursor: "pointer", padding: 0, fontSize: 14 }}>
              Withdraw
            </button>
          </p>
        )}

        {live && youAre && (
          <div style={{ display: "flex", gap: 10 }}>
            {confirmResign ? (
              <>
                <button onClick={() => { setConfirmResign(false); post("resign"); }} disabled={busy} style={{ ...btn(false), background: "#8E3B3E", color: "#FFEFEF", border: "none" }}>
                  Confirm resign
                </button>
                <button onClick={() => setConfirmResign(false)} style={btn(false)}>Keep playing</button>
              </>
            ) : (
              <>
                <button onClick={() => setConfirmResign(true)} disabled={busy} style={btn(false)}>Resign</button>
                <button onClick={() => post("draw", { action: "offer" })} disabled={busy || yourOffer} style={btn(false)}>
                  {yourOffer ? "Draw offered" : "Offer draw"}
                </button>
              </>
            )}
          </div>
        )}

        {!live && youAre && (
          <div style={{ display: "flex", gap: 10 }}>
            {rematchState === "idle" ? (
              <button onClick={rematch} disabled={busy} style={btn(true)}>Rematch</button>
            ) : (
              <p style={{ fontSize: 14, color: GOLD, flex: 1, padding: "11px 0" }}>
                {rematchState === "accepted"
                  ? `${opponent} already offered — check your challenges.`
                  : `Rematch offered to ${opponent}.`}
              </p>
            )}
          </div>
        )}

        {!live && youAre && sans.length > 0 && !posted && (
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p className="section-label">Share this game</p>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              placeholder={`Say something about the game… (leave blank for "${defaultCaption}")`}
              style={{
                width: "100%", background: "#1C1C21", color: "#F5F1E8",
                border: "1px solid rgba(212,175,55,0.15)", borderRadius: 12, padding: 12,
                fontSize: 15, lineHeight: 1.5, outline: "none", resize: "none", boxSizing: "border-box",
              }}
            />
            <button onClick={postGame} disabled={posting} style={btn(true)}>
              {posting ? "Posting…" : "Post this game"}
            </button>
          </div>
        )}

        {posted && <p style={{ fontSize: 14, fontWeight: 600, color: GOLD }}>Posted to your feed</p>}

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <p className="section-label" style={{ padding: "14px 18px 10px" }}>Moves</p>
          {sans.length === 0 ? (
            <p className="text-ivory-meta" style={{ fontSize: 14, padding: "0 18px 16px" }}>
              {live ? "The game begins with White." : "No moves recorded."}
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", paddingBottom: 6 }}>
              {movePairs.map((p) => (
                <div key={p.n} className="digits" style={{ display: "flex", gap: 8, padding: "5px 18px", fontSize: 14 }}>
                  <span style={{ color: "#6E6E78", minWidth: 20 }}>{p.n}.</span>
                  <span style={{ minWidth: 46 }}>{p.w}</span>
                  <span style={{ color: "#B5B5BE" }}>{p.b ?? ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <GameChat gameId={gameId} youId={youId} canWrite={youAre !== null} finished={!live} />
      </div>
    </div>
  );
}
