"use client";

import { Piece } from "./Pieces";

/**
 * §2 precision board: perfect square, 8×1fr grid, identical squares.
 * Renders any position given as 8 rank-strings (rank 8 → 1),
 * uppercase = white, lowercase = black, "." = empty.
 *
 * Read-only sibling of PlayBoard — same surface, same piece set, no
 * interaction. Used for replays and anywhere a position is quoted.
 */
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function Board({
  frame,
  coords = true,
  glow = false,
  maxWidth,
  flipped = false,
  lastMove = null,
}: {
  frame: string[];
  coords?: boolean;
  glow?: boolean;
  maxWidth?: number;
  flipped?: boolean;
  lastMove?: number[] | null;
}) {
  const squares = frame.join("").split("");

  return (
    <div
      style={{
        width: "100%",
        maxWidth: maxWidth ?? "100%",
        marginLeft: "auto",
        marginRight: "auto",
        borderRadius: 12,
        padding: 5,
        background: "linear-gradient(160deg, #26262C 0%, #17171B 100%)",
        border: "1px solid rgba(212,175,55,0.12)",
        boxShadow: glow
          ? "0 18px 50px rgba(0,0,0,0.5), 0 0 40px rgba(212,175,55,0.12)"
          : "0 14px 40px rgba(0,0,0,0.42)",
        boxSizing: "border-box",
        transition: "box-shadow 300ms ease-out",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gridTemplateRows: "repeat(8, 1fr)",
          borderRadius: 7,
          overflow: "hidden",
          containerType: "inline-size",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
        }}
      >
        {Array.from({ length: 64 }, (_, d) => {
          const idx = flipped ? 63 - d : d;
          const displayCol = d % 8;
          const displayRow = Math.floor(d / 8);
          const realRow = Math.floor(idx / 8);
          const realCol = idx % 8;

          const ch = squares[idx] ?? ".";
          const dark = (realRow + realCol) % 2 === 1;
          const isLast = lastMove?.includes(idx) ?? false;

          const base = dark ? "var(--sq-dark, #5E7A63)" : "var(--sq-light, #D3DAC9)";
          const ink = dark ? "var(--sq-light, #D3DAC9)" : "var(--sq-dark, #5E7A63)";

          return (
            <div
              key={d}
              style={{
                aspectRatio: "1 / 1",
                display: "grid",
                placeItems: "center",
                position: "relative",
                background: base,
              }}
            >
              {isLast && (
                <span style={{ position: "absolute", inset: 0, background: "rgba(212,175,55,0.30)" }} />
              )}

              {ch !== "." && (
                <span style={{ position: "relative", display: "grid", placeItems: "center", width: "100%", height: "100%" }}>
                  <Piece code={ch} />
                </span>
              )}

              {coords && displayCol === 0 && (
                <span
                  className="digits"
                  style={{
                    position: "absolute", top: "4%", left: "6%",
                    fontSize: "2.4cqw", fontWeight: 700, lineHeight: 1,
                    color: ink, opacity: 0.85,
                  }}
                >
                  {8 - realRow}
                </span>
              )}
              {coords && displayRow === 7 && (
                <span
                  style={{
                    position: "absolute", bottom: "3%", right: "6%",
                    fontSize: "2.4cqw", fontWeight: 700, lineHeight: 1,
                    color: ink, opacity: 0.85,
                  }}
                >
                  {FILES[realCol]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Parse a FEN placement field into 8 rank-strings for <Board frame>. */
export function fenToFrame(fen: string): string[] {
  const placement = fen.split(" ")[0];
  return placement.split("/").map((rank) =>
    rank.replace(/\d/g, (d) => ".".repeat(Number(d)))
  );
}
