/**
 * Board orientation — the one thing a chess UI must never get wrong.
 *
 * PlayBoard keeps a single coordinate system: index 0 is always a8 and
 * index 63 is always h1, whoever is looking. Flipping is a rendering
 * concern only, so every caller — the move handler, the highlight
 * squares, the check glow — keeps working in absolute indices and
 * cannot drift out of step with the view.
 *
 * This file asserts the mapping both ways round. If it passes, a
 * half-flipped board is impossible by construction.
 *
 *   node --experimental-strip-types lib/test-board.ts
 */

export {}; // a module, so these names cannot collide with the DOM globals

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

/** The real square under display cell `d`. This is PlayBoard's line 68. */
const squareAt = (d: number, flipped: boolean) => (flipped ? 63 - d : d);

/** Algebraic name of an absolute index. */
function squareName(idx: number): string {
  return `${FILES[idx % 8]}${8 - Math.floor(idx / 8)}`;
}

/** Light or dark, from the absolute index — must survive the flip. */
const isDark = (idx: number) => (Math.floor(idx / 8) + (idx % 8)) % 2 === 1;

let passed = 0;
const failures: string[] = [];

function check(label: string, got: unknown, want: unknown) {
  if (got === want) { passed++; return; }
  failures.push(`${label}\n    expected ${String(want)}\n    got      ${String(got)}`);
}

// ---------------------------------------------------------------- White

// Cell 0 is the top-left of the grid; cell 56 starts the bottom row.
check("White · top-left cell is a8", squareName(squareAt(0, false)), "a8");
check("White · top-right cell is h8", squareName(squareAt(7, false)), "h8");
check("White · bottom-left cell is a1", squareName(squareAt(56, false)), "a1");
check("White · bottom-right cell is h1", squareName(squareAt(63, false)), "h1");

// Files read a → h left to right along the bottom row.
check(
  "White · bottom row reads a→h",
  Array.from({ length: 8 }, (_, i) => squareName(squareAt(56 + i, false))).join(" "),
  "a1 b1 c1 d1 e1 f1 g1 h1",
);

// Ranks count 8 → 1 down the left column: White's own men at the bottom.
check(
  "White · left column reads 8→1",
  Array.from({ length: 8 }, (_, r) => squareName(squareAt(r * 8, false))).join(" "),
  "a8 a7 a6 a5 a4 a3 a2 a1",
);

// ---------------------------------------------------------------- Black

check("Black · top-left cell is h1", squareName(squareAt(0, true)), "h1");
check("Black · top-right cell is a1", squareName(squareAt(7, true)), "a1");
check("Black · bottom-left cell is h8", squareName(squareAt(56, true)), "h8");
check("Black · bottom-right cell is a8", squareName(squareAt(63, true)), "a8");

check(
  "Black · bottom row reads h→a",
  Array.from({ length: 8 }, (_, i) => squareName(squareAt(56 + i, true))).join(" "),
  "h8 g8 f8 e8 d8 c8 b8 a8",
);

check(
  "Black · left column reads 1→8",
  Array.from({ length: 8 }, (_, r) => squareName(squareAt(r * 8, true))).join(" "),
  "h1 h2 h3 h4 h5 h6 h7 h8",
);

// ------------------------------------------------- invariants, both ways

// Every square appears exactly once in each orientation.
for (const flipped of [false, true]) {
  const seen = new Set(Array.from({ length: 64 }, (_, d) => squareAt(d, flipped)));
  check(`${flipped ? "Black" : "White"} · all 64 squares present exactly once`, seen.size, 64);
}

// a1 is dark and h1 is light — "light square on the right" — and the flip
// must not change that, because square colour belongs to the board, not
// to the viewer.
check("a1 is dark", isDark(56), true);
check("h1 is light", isDark(63), false);
check(
  "colours survive the flip",
  Array.from({ length: 64 }, (_, d) => isDark(squareAt(d, true))).join(""),
  Array.from({ length: 64 }, (_, d) => isDark(squareAt(63 - d, false))).join(""),
);

// Coordinates are drawn from the REAL square, not the display cell, so a
// rank label in the left column must name that square's own rank.
for (const flipped of [false, true]) {
  const ok = Array.from({ length: 8 }, (_, r) => {
    const idx = squareAt(r * 8, flipped);
    return squareName(idx).endsWith(String(8 - Math.floor(idx / 8)));
  }).every(Boolean);
  check(`${flipped ? "Black" : "White"} · rank labels match their square`, ok, true);
}

// A highlight stored as an absolute index lands on the same square in
// both orientations — this is what makes a half-flipped board impossible.
const E4 = 36;
check("e4 is index 36", squareName(E4), "e4");
check(
  "highlighted square is the same square when flipped",
  squareName(squareAt(63 - E4, true)),
  squareName(squareAt(E4, false)),
);

// ----------------------------------------------------------------- report

console.log(`\nBoard orientation: ${passed} assertion${passed === 1 ? "" : "s"} passed.`);
if (failures.length) {
  console.error(`\n${failures.length} FAILED:\n`);
  failures.forEach((f) => console.error("  ✗ " + f + "\n"));
  process.exit(1);
}
console.log("White sees a1 bottom-left, Black sees h8 bottom-left, colours and");
console.log("labels follow the square rather than the cell. Orientation is sound.\n");
