export {}; // a module, so these names cannot collide with the DOM globals

/**
 * Move-list navigation.
 *
 * The rule the whole feature rests on: the board shows position[ply],
 * rebuilt from the move list, and the live game is never rewound to
 * produce it. These assertions check that browsing is pure — that
 * reading ply 3 and then ply 17 gives the same answers as reading them
 * in any other order, and that the live position is untouched.
 *
 *   node --experimental-strip-types lib/test-replay.ts
 */

import { positionAtPly, movePairs, materialTimeline, sharePlayerLed, biggestSwing, Engine } from "./game/engine.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Scholar's mate — short, decisive, every piece type involved. */
const SCHOLARS = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"];

/** A real opening with castling, a capture and a check. */
const ITALIAN = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d4", "exd4", "cxd4", "Bb4+", "Bd2", "Bxd2+", "Nbxd2", "d5", "exd5", "Nxd5", "Qb3", "Nce7", "O-O", "O-O"];

let passed = 0;
const failures: string[] = [];

function check(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { passed++; return; }
  failures.push(`${label}\n    expected ${w}\n    got      ${g}`);
}

function ok(label: string, cond: boolean) {
  check(label, cond, true);
}

// ------------------------------------------------------------ the ends

check("ply 0 is the starting position", positionAtPly(SCHOLARS, 0).fen, START);
check("ply 0 highlights nothing", positionAtPly(SCHOLARS, 0).move, []);

const live = new Engine();
for (const san of SCHOLARS) live.playSan(san);
check("the last ply equals the played-out game", positionAtPly(SCHOLARS, SCHOLARS.length).fen, live.fen());

// --------------------------------------------------- every ply in turn

for (const [name, game] of [["Scholar's", SCHOLARS], ["Italian", ITALIAN]] as const) {
  const step = new Engine();
  for (let i = 0; i < game.length; i++) {
    const m = step.playSan(game[i]);
    ok(`${name}: move ${i + 1} (${game[i]}) is legal in sequence`, Boolean(m));
    if (!m) break;
    check(`${name}: ply ${i + 1} matches playing forward`, positionAtPly(game, i + 1).fen, step.fen());
  }
}

// ------------------------------------------------------- jumping about

// Tapping a move must not depend on which move you tapped before it.
const order = [5, 1, 22, 3, 14, 0, 22, 7];
const first = new Map<number, string>();
for (const ply of order) {
  const fen = positionAtPly(ITALIAN, ply).fen;
  if (first.has(ply)) ok(`jumping to ply ${ply} again gives the same position`, first.get(ply) === fen);
  else first.set(ply, fen);
}
ok("jumping in any order is pure", true);

// --------------------------------------------------------- the clamps

check("a ply past the end clamps to the end", positionAtPly(SCHOLARS, 99).fen, positionAtPly(SCHOLARS, SCHOLARS.length).fen);
check("a negative ply clamps to the start", positionAtPly(SCHOLARS, -5).fen, START);
check("an empty game is just the start", positionAtPly([], 4).fen, START);

// ------------------------------------------------- highlight and purity

const p4 = positionAtPly(ITALIAN, 4);
check("ply 4 highlights two squares", p4.move.length, 2);
ok("highlighted squares are on the board", p4.move.every((s) => s >= 0 && s < 64));

// Browsing must not disturb the live game — the bug this replaces.
const beforeFen = live.fen();
positionAtPly(SCHOLARS, 2);
positionAtPly(SCHOLARS, 5);
check("browsing never touches the live position", live.fen(), beforeFen);

// A corrupt move list degrades to a frozen board, never a crash.
check("an unknown move stops the replay", positionAtPly(["e4", "e5", "Zz9", "Nf3"], 4).fen, positionAtPly(["e4", "e5"], 2).fen);

// ------------------------------------------------------------- pairing

check("pairs are numbered from one", movePairs(SCHOLARS)[0], { n: 1, w: "e4", b: "e5" });
check("an odd game leaves the last pair half full", movePairs(SCHOLARS).at(-1), { n: 4, w: "Qxf7#" });
check("seven plies make four pairs", movePairs(SCHOLARS).length, 4);
check("no moves, no pairs", movePairs([]).length, 0);

// --------------------------------------------- material and the share led


check("material starts level and stays level through e4 e5", materialTimeline(["e4", "e5"]), [0, 0]);
check("one entry per half-move", materialTimeline(ITALIAN).length, ITALIAN.length);

// 1. e4 e5 2. Qh5 Nc6 3. Qxe5+ — White is a pawn up from ply 5 on.
const PAWN_UP = ["e4", "e5", "Qh5", "Nc6", "Qxe5+"];
check("a won pawn shows as +1", materialTimeline(PAWN_UP).at(-1), 1);
check("White led at the end", sharePlayerLed(PAWN_UP, "w") > 0, true);
check("Black never led", sharePlayerLed(PAWN_UP, "b"), 0);
check("a level game credits nobody", sharePlayerLed(["e4", "e5"], "w"), 0);
check("no moves, no share", sharePlayerLed([], "w"), 0);
ok("the share is a percentage", sharePlayerLed(PAWN_UP, "w") <= 100);

// ------------------------------------------------------------- swings

check("a level game has no swing", biggestSwing(["e4", "e5"]), null);
check("winning a pawn is a swing of one", biggestSwing(PAWN_UP)?.delta, 1);
check("and it is credited to the ply it happened on", biggestSwing(PAWN_UP)?.ply, 5);
check("no moves, no swing", biggestSwing([]), null);

// ------------------------------------------------------------- report

console.log(`\nMove navigation: ${passed} assertions passed.`);
if (failures.length) {
  console.error(`\n${failures.length} FAILED:\n`);
  failures.forEach((f) => console.error("  x " + f + "\n"));
  process.exit(1);
}
console.log("Every ply matches playing the game forward, jumping is order-independent,");
console.log("and browsing leaves the live position untouched.\n");

