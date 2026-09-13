// Server-authoritative move loop tests: clocks, flags, idempotency, results.
// Run: node --experimental-strip-types lib/test-gameloop.ts
import { GlyphGame } from "./game/server.ts";
import { parseSquare as sq } from "./game/engine.ts";

let pass = 0, fail = 0;
const t = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.log(`  ✗ ${name}`)); };

// Injectable clock so time is deterministic
let clock = 1_000_000;
const mk = (initialMs = 900_000, incrementMs = 10_000) =>
  new GlyphGame({ id: "g1", whiteId: "alice", blackId: "bob", initialMs, incrementMs, rated: true, now: () => clock });

// ---- turn order, membership, legality ----
let g = mk();
t("spectator cannot move", g.moveIntent("carol", 0, sq("e2"), sq("e4")).ok === false);
t("black cannot move first", (g.moveIntent("bob", 0, sq("e7"), sq("e5")) as { error: string }).error === "not_your_turn");
t("illegal move rejected", (g.moveIntent("alice", 0, sq("e2"), sq("e5")) as { error: string }).error === "illegal");
t("legal move accepted", g.moveIntent("alice", 0, sq("e2"), sq("e4")).ok === true);

// ---- idempotency / replay rejection ----
const replay = g.moveIntent("alice", 0, sq("d2"), sq("d4"));
t("replayed seq rejected", !replay.ok && (replay as { error: string }).error === "stale_seq");
t("duplicate intent cannot double-apply", g.snapshot().moveCount === 1);

// ---- clocks + increment ----
clock += 5_000; // black thinks 5s
const bm = g.moveIntent("bob", 1, sq("e7"), sq("e5"));
t("black clock: 900s − 5s + 10s inc = 905s", bm.ok && bm.snapshot.clocks.b === 905_000);
t("white clock untouched while black thought", bm.snapshot.clocks.w === 910_000); // 900 − 0 + 10 from move 1

// ---- flag: server timestamp decides move-vs-flag races ----
g = mk(10_000, 0); // 10s, no increment
g.moveIntent("alice", 0, sq("e2"), sq("e4"));
clock += 11_000; // black oversleeps
const late = g.moveIntent("bob", 1, sq("e7"), sq("e5"));
t("move after flag is refused", !late.ok && (late as { error: string }).error === "flagged");
t("flag finishes game 1-0", late.snapshot.status === "finished" && late.snapshot.result === "1-0" && late.snapshot.endReason === "timeout");
t("moves in finished games rejected", (g.moveIntent("alice", 1, sq("d2"), sq("d4")) as { error: string }).error === "finished");

// ---- heartbeat tick flags an idle player ----
g = mk(10_000, 0); clock += 20_000;
t("tick flags idle white", g.tick().status === "finished" && g.tick().result === "0-1");

// ---- checkmate finalizes + PGN + rating trigger surface ----
g = mk();
const line: [string, string, string][] = [["alice","e2","e4"],["bob","e7","e5"],["alice","f1","c4"],["bob","b8","c6"],["alice","d1","h5"],["bob","g8","f6"],["alice","h5","f7"]];
let last; let i = 0;
for (const [who, f, to] of line) last = g.moveIntent(who, i++, sq(f), sq(to));
t("checkmate finishes 1-0", last!.ok && last!.finished?.reason === "checkmate" && last!.snapshot.result === "1-0");
t("PGN carries result + mate SAN", g.pgn({ White: "alice", Black: "bob" }).includes("Qxf7# 1-0"));

// ---- resign / draw agreement ----
g = mk(); g.moveIntent("alice", 0, sq("e2"), sq("e4"));
t("resign finishes correctly", g.resign("alice").result === "0-1");
g = mk();
g.offerDraw("alice");
t("own offer doesn't end game", g.snapshot().status === "active");
t("opponent accept ends in draw", g.offerDraw("bob").result === "1/2-1/2");
g = mk();
g.offerDraw("alice");
g.moveIntent("alice", 0, sq("e2"), sq("e4"));
t("a move voids pending draw offer", g.snapshot().drawOffer === null);

// ---- reconnection resync: snapshot is complete ----
g = mk(); g.moveIntent("alice", 0, sq("e2"), sq("e4"));
const snap = g.snapshot();
t("snapshot has fen+sans+clocks for resync", snap.fen.startsWith("rnbqkbnr/pppppppp/8/8/4P3") && snap.sans[0] === "e4" && snap.clocks.w > 0);

console.log(`\ngameloop: ${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
