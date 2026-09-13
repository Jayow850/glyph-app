"use client";

const GLYPHS: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function PlayBoard({
  frame,
  selected,
  targets,
  lastMove,
  onSquare,
  coords = true,
}: {
  frame: string[];                 // 8 rank-strings, rank 8 first
  selected: number | null;         // 0–63 grid index
  targets: number[];               // legal destination squares (0–63)
  lastMove: [number, number] | null;
  onSquare: (index: number) => void;
  coords?: boolean;
}) {
  return (
    <div style={{ width: "100%", marginLeft: "auto", marginRight: "auto" }}>
      <div style={{
        width: "100%", aspectRatio: "1 / 1", display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)", gridTemplateRows: "repeat(8, 1fr)",
        border: "1px solid rgba(212,175,55,0.15)", borderRadius: 8,
        overflow: "hidden", containerType: "inline-size",
      }}>
        {frame.map((row, r) =>
          row.split("").map((ch, c) => {
            const idx = r * 8 + c;
            const dark = (r + c) % 2 === 1;
            const isWhitePiece = ch !== "." && ch === ch.toUpperCase();
            const isSelected = selected === idx;
            const isTarget = targets.includes(idx);
            const isLast = lastMove?.includes(idx);

            return (
              <button
                key={idx}
                onClick={() => onSquare(idx)}
                style={{
                  aspectRatio: "1 / 1", display: "grid", placeItems: "center",
                  position: "relative", border: "none", padding: 0, cursor: "pointer",
                  background: isSelected
                    ? "rgba(212,175,55,0.38)"
                    : isLast
                    ? "rgba(212,175,55,0.18)"
                    : dark ? "#2A2A30" : "#3A3A42",
                  transition: "background 160ms",
                }}
              >
                {ch !== "." && (
                  <span style={{
                    fontSize: "8.75cqw", lineHeight: 1,
                    color: isWhitePiece ? "#F5F1E8" : "#5C5C66",
                    textShadow: isWhitePiece ? "0 1px 2px rgba(0,0,0,0.5)" : "none",
                  }}>
                    {GLYPHS[ch.toLowerCase()]}
                  </span>
                )}

                {/* legal-move hint: dot on empty squares, ring on captures */}
                {isTarget && (
                  <span style={{
                    position: "absolute", pointerEvents: "none", boxSizing: "border-box",
                    width: ch === "." ? "26%" : "84%",
                    height: ch === "." ? "26%" : "84%",
                    borderRadius: "50%",
                    background: ch === "." ? "rgba(212,175,55,0.55)" : "transparent",
                    border: ch === "." ? "none" : "3px solid rgba(212,175,55,0.7)",
                  }} />
                )}

                {coords && c === 0 && (
                  <span className="digits" style={{ position: "absolute", top: 2, left: 3, fontSize: 10, color: "rgba(212,175,55,0.45)" }}>{8 - r}</span>
                )}
                {coords && r === 7 && (
                  <span style={{ position: "absolute", bottom: 1, right: 3, fontSize: 10, color: "rgba(212,175,55,0.45)" }}>{FILES[c]}</span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}