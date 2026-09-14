"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Engine } from "../../lib/game/engine";
import { PlayBoard } from "@/components/social/PlayBoard";

const gridToX88 = (i: number) => (7 - Math.floor(i / 8)) * 16 + (i % 8);
const x88ToGrid = (s: number) => (7 - (s >> 4)) * 8 + (s & 7);

function frameFromFen(fen: string): string[] {
  return fen.split(" ")[0].split("/").map((r) => r.replace(/\d/g, (d) => ".".repeat(Number(d))));
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
  const router = useRouter();

  const engine = useMemo(() => new Engine(fen), [fen]);
  const legal = useMemo(() => engine.legalMoves(), [engine]);
  const myTurn = youAre !== null && engine.turn === youAre && status === "ACTIVE";

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

      <PlayBoard
        frame={frameFromFen(fen)}
        selected={selected}
        targets={targets}
        lastMove={null}
        onSquare={handleSquare}
      />

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