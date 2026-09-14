"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Engine } from "../../lib/game/engine";
import { PlayBoard } from "@/components/social/PlayBoard";

const gridToX88 = (i: number) => (7 - Math.floor(i / 8)) * 16 + (i % 8);
const x88ToGrid = (s: number) => (7 - (s >> 4)) * 8 + (s & 7);

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

function frameFromFen(fen: string): string[] {
  return fen.split(" ")[0].split("/").map((r) => r.replace(/\d/g, (d) => ".".repeat(Number(d))));
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

/** Build a PGN from the move list. */
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

export function LiveGameBoard({
  gameId, initialFen, initialSans, youAre, whiteName, blackName, status, result,
}: {
  gameId: string; initialFen: string; initialSans: string[];
  youAre: "w" | "b" | null; whiteName: string; blackName: string;
  status: string; result: string | null;
}) {
  const [fen, setFen] = useState(initialFen);
  const [sans, setSans] = useState<string[]>(initialSans);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [caption, setCaption] = useState("");
  const router = useRouter();

  const engine = useMemo(() => new Engine(fen), [fen]);
  const legal = useMemo(() => engine.legalMoves(), [engine]);
  const myTurn = youAre !== null && engine.turn === youAre && status === "ACTIVE";

  const opponent = youAre === "w" ? blackName : whiteName;
  const youWon = (youAre === "w" && result === "1-0") || (youAre === "b" && result === "0-1");
  const defaultCaption =
    result === "1/2-1/2" ? `Drew with ${opponent}.`
    : youWon ? `Beat ${opponent}. ♟`
    : `Lost to ${opponent}. Good game.`;

  // Poll for the opponent's move every 3 seconds
  useEffect(() => {
    if (status !== "ACTIVE") return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/games/${gameId}/state`);
      if (res.ok) {
        const data = await res.json();
        if (data.fen !== fen) { setFen(data.fen); setSans(data.sans); router.refresh(); }
      }
    }, 3000);
    return () => clearInterval(t);
  }, [gameId, fen, status, router]);

  const targets = useMemo(() => {
    if (selected === null || !myTurn) return [];
    const from88 = gridToX88(selected);
    return legal.filter((m) => m.from === from88).map((m) => x88ToGrid(m.to));
  }, [selected, legal, myTurn]);

  const frame = frameFromFen(fen);
  const { whiteLost, blackLost } = capturedFrom(frame);
  const scoreFor = (lost: string[]) => lost.reduce((s, p) => s + (VALUE[p.toLowerCase()] ?? 0), 0);
  const edge = scoreFor(whiteLost) - scoreFor(blackLost); // positive = Black ahead

  async function handleSquare(idx: number) {
    if (!myTurn || busy) return;

    if (selected !== null && targets.includes(idx)) {
      setBusy(true);
      setError(null);
      const res = await fetch(`/api/games/${gameId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: selected, to: idx, promotion: "q" }),
      });
      setBusy(false);
      setSelected(null);
      if (res.ok) {
        const data = await res.json();
        setFen(data.fen);
        setSans(data.sans);
        router.refresh();
      } else {
        setError("That move was rejected.");
      }
      return;
    }

    const from88 = gridToX88(idx);
    setSelected(legal.some((m) => m.from === from88) ? idx : null);
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

  const turnName = engine.turn === "w" ? whiteName : blackName;
  const statusText =
    status !== "ACTIVE" ? `Game over — ${result ?? "finished"}`
    : youAre === null ? `Spectating · ${turnName} to move`
    : myTurn ? (engine.inCheck() ? "Your move — you're in check!" : "Your move")
    : `Waiting for ${turnName}…`;

  return (
    <>
      <p className="text-gold" style={{ fontSize: 15, fontWeight: 600 }}>{statusText}</p>
      {error && <p style={{ color: "#B0575A", fontSize: 14 }}>{error}</p>}

      {status !== "ACTIVE" && youAre && sans.length > 0 && !posted && (
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
          <button
            onClick={postGame}
            disabled={posting}
            className="bg-gold text-night"
            style={{
              borderRadius: 12, padding: "12px 0", fontWeight: 600, fontSize: 15,
              border: "none", cursor: "pointer", opacity: posting ? 0.5 : 1,
            }}
          >
            {posting ? "Posting…" : "♟ Post this game"}
          </button>
        </div>
      )}

      {posted && (
        <p className="text-gold" style={{ fontSize: 14, fontWeight: 600 }}>✓ Posted to your feed</p>
      )}

      <CapturedStrip pieces={whiteLost} advantage={edge} />

      <PlayBoard
        frame={frame}
        selected={selected}
        targets={targets}
        lastMove={null}
        onSquare={handleSquare}
      />

      <CapturedStrip pieces={blackLost} advantage={-edge} />

      <div className="card">
        <p className="section-label" style={{ marginBottom: 8 }}>Moves</p>
        {sans.length === 0 ? (
          <p className="text-ivory-meta" style={{ fontSize: 14 }}>No moves yet.</p>
        ) : (
          <p className="digits" style={{ fontSize: 14, lineHeight: 1.8 }}>
            {sans.map((san, i) => (
              <span key={i}>{i % 2 === 0 && <b className="text-ivory-meta">{i / 2 + 1}. </b>}{san} </span>
            ))}
          </p>
        )}
      </div>
    </>
  );
}