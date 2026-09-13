"use client";

/**
 * §2 precision board: perfect square, 8×1fr grid, identical squares,
 * pieces at ~70% of square width via container units, optional coords.
 * Renders any position given as 8 rank-strings (rank 8 → 1),
 * uppercase = white, lowercase = black, "." = empty.
 */
const GLYPHS: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function Board({
  frame,
  coords = true,
  glow = false,
  maxWidth,
}: {
  frame: string[];
  coords?: boolean;
  glow?: boolean;
  maxWidth?: number;
}) {
  return (
    <div style={{ width: "100%", maxWidth: maxWidth ?? "100%", marginLeft: "auto", marginRight: "auto" }}>
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gridTemplateRows: "repeat(8, 1fr)",
          border: "1px solid rgba(212,175,55,0.08)",
          borderRadius: 8,
          overflow: "hidden",
          containerType: "inline-size",
          boxShadow: glow ? "0 0 40px rgba(212,175,55,0.12)" : "none",
          transition: "box-shadow 300ms ease-out",
        }}
      >
        {frame.map((row, r) =>
          row.split("").map((ch, c) => {
            const dark = (r + c) % 2 === 1;
            const isWhite = ch !== "." && ch === ch.toUpperCase();
            return (
              <div
                key={`${r}${c}`}
                style={{
                  aspectRatio: "1 / 1",
                  display: "grid",
                  placeItems: "center",
                  position: "relative",
                  background: dark ? "#2A2A30" : "#3A3A42",
                }}
              >
                {ch !== "." && (
                  <span
                    style={{
                      fontSize: "8.75cqw",
                      lineHeight: 1,
                      color: isWhite ? "#F5F1E8" : "#5C5C66",
                      textShadow: isWhite ? "0 1px 2px rgba(0,0,0,0.5)" : "none",
                    }}
                  >
                    {GLYPHS[ch.toLowerCase()]}
                  </span>
                )}
                {coords && c === 0 && (
                  <span className="digits" style={{ position: "absolute", top: 2, left: 3, fontSize: 10, color: "rgba(212,175,55,0.45)" }}>
                    {8 - r}
                  </span>
                )}
                {coords && r === 7 && (
                  <span style={{ position: "absolute", bottom: 1, right: 3, fontSize: 10, color: "rgba(212,175,55,0.45)" }}>
                    {FILES[c]}
                  </span>
                )}
              </div>
            );
          })
        )}
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
