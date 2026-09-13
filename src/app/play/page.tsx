"use client";

import { useState, useMemo } from "react";
import { Engine } from "../../../lib/game/engine";
import { PlayBoard } from "@/components/social/PlayBoard";

/** The engine uses 0x88 (128 squares); the board uses a 0–63 grid. Translate both ways. */
const gridToX88 = (i: number) => (7 - Math.floor(i / 8)) * 16 + (i % 8);
const x88ToGrid = (s: number) => (7 - (s >> 4)) * 8 + (s & 7);

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

function frameFromFen(fen: string): string[] {
  return fen.split(" ")[0].split("/").map((rank) => rank.replace(/\d/g, (d) => ".".repeat(Number(d))));
}

/** Work out captured material by diffing the board against a full starting set. */
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

/** A simple opponent: prefers captures and promotions, otherwise plays at random. */
function pickReply(e: Engine) {
  const moves = e.legalMoves();
  if (moves.length === 0) return null;
  const scored = moves.map((m) => {
    let score = Math.random();
    if (m.flags & 1) score += 3;
    if (m.promotion) score += 5;
    return { m, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].m;
}

/** Captured pieces strip shown above and below the board. */
function CapturedStrip({ pieces, advantage }: { pieces: string[]; advantage: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, minHeight: 24, flexWrap: "wrap" }}>
      {pieces.map((p, i) => (
        <span key={i} style={{ fontSize: 18, color: "#8A8A93", lineHeight: 1 }}>{GLYPH[p.toLowerCase()]}</span>
      ))}
      {advantage > 0 && <span className="text-gold digits" style={{ fontSize: 13, marginLeft: 6 }}>+{advantage}</span>}
    </div>
  );
}

export default function PlayPage() {
  const [fen, setFen] = useState(START);
  const [history, setHistory] = useState<string[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<[number, number] | null>(null);

  const engine = useMemo(() => new Engine(fen), [fen]);
  const legal = useMemo(() => engine.legalMoves(), [engine]);
  const status = engine.status();
  const turn = engine.turn === "w" ? "White" : "Black";

  const targets = useMemo(() => {
    if (selected === null) return [];
    const from88 = gridToX88(selected);
    return legal.filter((m) => m.from === from88).map((m) => x88ToGrid(m.to));
  }, [selected, legal]);

  const frame = frameFromFen(fen);
  const { whiteLost, blackLost } = capturedFrom(frame);
  const scoreFor = (lost: string[]) => lost.reduce((sum, p) => sum + (VALUE[p.toLowerCase()] ?? 0), 0);
  const edge = scoreFor(whiteLost) - scoreFor(blackLost); // positive = Black ahead

  function handleSquare(idx: number) {
    if (status !== "active") return;

    if (selected !== null && targets.includes(idx)) {
      const e = new Engine(fen);
      const move = e.move(gridToX88(selected), gridToX88(idx), "q");
      if (move) {
        const sans = [move.san ?? "?"];
        let newLast: [number, number] = [selected, idx];

        if (e.status() === "active") {
          const reply = pickReply(e);
          if (reply) {
            const done = e.move(reply.from, reply.to, "q");
            if (done) {
              sans.push(done.san ?? "?");
              newLast = [x88ToGrid(reply.from), x88ToGrid(reply.to)];
            }
          }
        }

        setHistory((h) => [...h, ...sans]);
        setLastMove(newLast);
        setFen(e.fen());
      }
      setSelected(null);
      return;
    }

    const from88 = gridToX88(idx);
    const hasMoves = legal.some((m) => m.from === from88);
    setSelected(hasMoves ? idx : null);
  }

  function reset() {
    setFen(START);
    setHistory([]);
    setSelected(null);
    setLastMove(null);
  }

  const statusText =
    status === "checkmate" ? `Checkmate — ${engine.turn === "w" ? "Black" : "White"} wins`
    : status === "stalemate" ? "Stalemate — draw"
    : status === "threefold" ? "Draw by repetition"
    : status === "fifty" ? "Draw by fifty-move rule"
    : status === "material" ? "Draw — insufficient material"
    : engine.inCheck() ? `${turn} to move — check!`
    : `${turn} to move`;

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 className="font-display" style={{ fontSize: 24, flex: 1 }}>Play</h1>
        <button onClick={reset} className="text-ivory-meta"
          style={{ fontSize: 13, border: "1px solid rgba(212,175,55,0.15)", borderRadius: 999, padding: "6px 14px", background: "none", cursor: "pointer" }}>
          New game
        </button>
      </div>

      <p className="text-gold" style={{ fontSize: 15, fontWeight: 600 }}>{statusText}</p>

      <CapturedStrip pieces={whiteLost} advantage={edge} />
      <PlayBoard
        frame={frame}
        selected={selected}
        targets={targets}
        lastMove={lastMove}
        onSquare={handleSquare}
      />
      <CapturedStrip pieces={blackLost} advantage={-edge} />

      <div className="card">
        <p className="section-label" style={{ marginBottom: 8 }}>Moves</p>
        {history.length === 0 ? (
          <p className="text-ivory-meta" style={{ fontSize: 14 }}>Tap a piece to begin.</p>
        ) : (
          <p className="digits" style={{ fontSize: 14, lineHeight: 1.8 }}>
            {history.map((san, i) => (
              <span key={i}>{i % 2 === 0 && <b className="text-ivory-meta">{i / 2 + 1}. </b>}{san} </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}