"use client";

import { Piece } from "./Pieces";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function PlayBoard({
  frame,
  selected,
  targets,
  lastMove,
  onSquare,
  coords = true,
  flipped = false,
  checkSquare = null,
  disabled = false,
}: {
  frame: string[];                 // 8 rank-strings, rank 8 first
  selected: number | null;         // 0–63 grid index (always white's orientation)
  targets: number[];               // legal destination squares (0–63)
  lastMove: number[] | null;
  onSquare: (index: number) => void;
  coords?: boolean;
  /** Render from Black's side of the table. Indices stay absolute. */
  flipped?: boolean;
  /** Square of a king in check — gets a warning glow. */
  checkSquare?: number | null;
  disabled?: boolean;
}) {
  // One flat board, indexed the same way regardless of which side is
  // looking at it. Flipping is purely a rendering concern: square 0 is
  // always a8, so every caller keeps working in one coordinate system.
  const squares = frame.join("").split("");

  return (
    <div
      style={{
        width: "100%",
        borderRadius: 14,
        padding: 6,
        background: "linear-gradient(160deg, #26262C 0%, #17171B 100%)",
        boxShadow: "0 22px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
        border: "1px solid rgba(212,175,55,0.14)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gridTemplateRows: "repeat(8, 1fr)",
          borderRadius: 8,
          overflow: "hidden",
          containerType: "inline-size",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
        }}
      >
        {Array.from({ length: 64 }, (_, d) => {
          const idx = flipped ? 63 - d : d;      // real square under this cell
          const displayCol = d % 8;
          const displayRow = Math.floor(d / 8);
          const realRow = Math.floor(idx / 8);
          const realCol = idx % 8;

          const ch = squares[idx] ?? ".";
          const dark = (realRow + realCol) % 2 === 1;
          const isSelected = selected === idx;
          const isTarget = targets.includes(idx);
          const isLast = lastMove?.includes(idx) ?? false;
          const inCheck = checkSquare === idx;

          const base = dark ? "var(--sq-dark, #5E7A63)" : "var(--sq-light, #D3DAC9)";
          const ink = dark ? "var(--sq-light, #D3DAC9)" : "var(--sq-dark, #5E7A63)";

          return (
            <button
              key={d}
              onClick={() => onSquare(idx)}
              disabled={disabled}
              aria-label={`${FILES[realCol]}${8 - realRow}`}
              style={{
                aspectRatio: "1 / 1",
                display: "grid",
                placeItems: "center",
                position: "relative",
                border: "none",
                padding: 0,
                cursor: disabled ? "default" : "pointer",
                background: base,
                transition: "background 140ms",
              }}
            >
              {/* last move and selection wash over the square colour,
                  so the board surface still shows through */}
              {(isLast || isSelected) && (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    background: isSelected ? "rgba(212,175,55,0.52)" : "rgba(212,175,55,0.30)",
                  }}
                />
              )}

              {inCheck && (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    background: "radial-gradient(circle at 50% 50%, rgba(205,66,66,0.85) 0%, rgba(205,66,66,0.35) 52%, rgba(205,66,66,0) 76%)",
                  }}
                />
              )}

              {ch !== "." && (
                <span style={{ position: "relative", display: "grid", placeItems: "center", width: "100%", height: "100%" }}>
                  <Piece code={ch} />
                </span>
              )}

              {/* legal-move hint: dot on empty squares, ring on captures */}
              {isTarget && (
                <span
                  style={{
                    position: "absolute",
                    pointerEvents: "none",
                    boxSizing: "border-box",
                    width: ch === "." ? "30%" : "92%",
                    height: ch === "." ? "30%" : "92%",
                    borderRadius: "50%",
                    background: ch === "." ? "rgba(22,24,20,0.34)" : "transparent",
                    border: ch === "." ? "none" : "0.9cqw solid rgba(22,24,20,0.34)",
                  }}
                />
              )}

              {coords && displayCol === 0 && (
                <span
                  className="digits"
                  style={{
                    position: "absolute", top: "4%", left: "6%",
                    fontSize: "2.4cqw", fontWeight: 700, lineHeight: 1,
                    color: ink, opacity: 0.85, pointerEvents: "none",
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
                    color: ink, opacity: 0.85, pointerEvents: "none",
                  }}
                >
                  {FILES[realCol]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
