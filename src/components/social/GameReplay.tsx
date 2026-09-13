"use client";

import { useState, useMemo } from "react";
import { Engine } from "../../../lib/game/engine";
import { Board } from "./Board";

/** Replay a posted game: step through the moves on a board. */
export function GameReplay({ pgn }: { pgn: string }) {
  // Strip headers, then pull out the SAN moves
  const sans = useMemo(() => {
    const body = pgn.replace(/\[[^\]]*\]/g, " ");
    return body
      .replace(/\d+\./g, " ")
      .replace(/(1-0|0-1|1\/2-1\/2|\*)/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }, [pgn]);

  // Replay the game once, capturing the position after every move
  const positions = useMemo(() => {
    const e = new Engine();
    const frames: string[] = [e.fen()];
    for (const san of sans) {
      const match = e.legalMoves().find((m) => {
        const test = new Engine(e.fen());
        const done = test.move(m.from, m.to, m.promotion?.toLowerCase());
        return done?.san === san;
      });
      if (!match) break;
      e.move(match.from, match.to, match.promotion?.toLowerCase());
      frames.push(e.fen());
    }
    return frames;
  }, [sans]);

  const [ply, setPly] = useState(positions.length - 1);
  const frame = positions[Math.min(ply, positions.length - 1)]
    .split(" ")[0].split("/").map((r) => r.replace(/\d/g, (d) => ".".repeat(Number(d))));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Board frame={frame} coords={false} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <button onClick={() => setPly(0)} className="text-ivory-meta"
          style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", minWidth: 32 }}>⏮</button>
        <button onClick={() => setPly((p) => Math.max(0, p - 1))} className="text-ivory-meta"
          style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", minWidth: 44, minHeight: 44 }}>‹</button>
        <span className="digits text-ivory-meta" style={{ fontSize: 13, minWidth: 72, textAlign: "center" }}>
          {ply === 0 ? "Start" : sans[ply - 1]} · {ply}/{positions.length - 1}
        </span>
        <button onClick={() => setPly((p) => Math.min(positions.length - 1, p + 1))} className="text-ivory-meta"
          style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", minWidth: 44, minHeight: 44 }}>›</button>
        <button onClick={() => setPly(positions.length - 1)} className="text-ivory-meta"
          style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", minWidth: 32 }}>⏭</button>
      </div>
    </div>
  );
}