// Engine correctness suite. Run: node --experimental-strip-types lib/test-engine.ts
import { Engine, parseSquare as sq } from "./game/engine.ts";

let pass = 0, fail = 0;
const t = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.log(`  ✗ ${name}`)); };

// ---- PERFT: the gold-standard move-generation validation ----
const perfts: [string, number, number][] = [
  ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 4, 197281],
  ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 3, 97862], // Kiwipete: castling/pins
  ["8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 4, 43238],                            // en-passant pins
  ["rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 3, 62379],             // promotions
];
for (const [fen, d, want] of perfts) t(`perft(${d}) ${fen.slice(0, 20)}`, new Engine(fen).perft(d) === want);

// ---- Checkmate / stalemate ----
const scholars = new Engine();
for (const [f, to] of [["e2","e4"],["e7","e5"],["f1","c4"],["b8","c6"],["d1","h5"],["g8","f6"],["h5","f7"]])
  scholars.move(sq(f), sq(to));
t("scholar's mate is checkmate", scholars.isCheckmate());
t("mate SAN has #", scholars.pgn().includes("Qxf7#"));
t("stalemate detected", new Engine("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1").isStalemate());
t("back-rank mate", new Engine("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1").move(sq("a1"), sq("a8"))!.san === "Ra8#");

// ---- Castling rights ----
const c1 = new Engine("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
t("white can castle both sides", c1.legalMoves().filter((m) => m.flags & 8).length === 2);
c1.move(sq("h1"), sq("h2")); c1.move(sq("h8"), sq("h7")); c1.move(sq("h2"), sq("h1")); c1.move(sq("h7"), sq("h8"));
t("rook move kills kingside right only", c1.legalMoves().filter((m) => m.flags & 8).length === 1);
t("cannot castle through check", new Engine("4k3/8/8/8/8/5r2/8/4K2R w K - 0 1").legalMoves().every((m) => !(m.flags & 8)));

// ---- En passant ----
const ep = new Engine("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
ep.move(sq("e2"), sq("e4")); ep.move(sq("a7"), sq("a6")); ep.move(sq("e4"), sq("e5")); ep.move(sq("d7"), sq("d5"));
const epMove = ep.move(sq("e5"), sq("d6"));
t("en passant capture works", epMove !== null && epMove.san === "exd6");
t("captured pawn removed", ep.fen().split(" ")[0].split("/")[3] === "8");

// ---- Promotion (with piece choice, under check) ----
const promo = new Engine("8/P6k/8/8/8/8/8/K7 w - - 0 1");
t("promotes to knight", promo.move(sq("a7"), sq("a8"), "n")!.san === "a8=N");
t("promotion can capture the checker", new Engine("q3k3/1P6/8/8/8/8/8/K7 w - - 0 1").move(sq("b7"), sq("a8"), "q")!.san === "bxa8=Q+");

// ---- Draws ----
t("insufficient: K vs K", new Engine("8/8/8/4k3/8/8/8/4K3 w - - 0 1").isInsufficientMaterial());
t("insufficient: KB vs K", new Engine("8/8/8/4k3/8/8/8/2B1K3 w - - 0 1").isInsufficientMaterial());
t("sufficient: KB vs KB opposite colors", !new Engine("8/8/8/3bk3/8/8/8/2B1K3 w - - 0 1").isInsufficientMaterial());
t("fifty-move rule", new Engine("8/8/8/4k3/8/8/4R3/4K3 w - - 100 80").isFiftyMove());
const rep = new Engine("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
for (let i = 0; i < 2; i++) { rep.move(sq("e1"), sq("d1")); rep.move(sq("e8"), sq("d8")); rep.move(sq("d1"), sq("e1")); rep.move(sq("d8"), sq("e8")); }
t("threefold repetition", rep.isThreefold());

// ---- Legality rejections ----
t("cannot move into check", new Engine("4k3/8/8/8/8/8/r7/4K3 w - - 0 1").move(sq("e1"), sq("e2")) === null);
t("pinned piece cannot move", new Engine("4k3/8/8/8/8/4r3/4N3/4K3 w - - 0 1").move(sq("e2"), sq("c3")) === null);
t("out-of-turn piece rejected", new Engine().move(sq("e7"), sq("e5")) === null);

// ---- FEN round-trip + SAN disambiguation ----
const kiwi = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
t("FEN round-trips", new Engine(kiwi).fen() === kiwi);
t("SAN disambiguates file", new Engine("4k3/8/8/8/8/8/4K3/R6R w - - 0 1").move(sq("a1"), sq("d1"))!.san === "Rad1");

console.log(`\nengine: ${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
