import { Engine } from "@engine/game/engine";

/**
 * Clock arithmetic for live games.
 *
 * The server owns time. A client's countdown is decoration — every
 * authoritative reading is derived from `lastMoveAt` and the stored
 * balances, so a slow network or a tampered clock cannot buy a player
 * a single millisecond.
 *
 * Nothing ticks until White has actually played. A game can sit in the
 * list for an hour before either player opens it, and burning White's
 * clock during that time is the single most unfair thing a chess server
 * can do.
 */

export type Side = "w" | "b";

export interface ClockBearing {
  fen: string;
  whiteMs: number;
  blackMs: number;
  lastMoveAt: Date;
  status: string;
  /** False until White's first move. Older rows without it are treated as started. */
  clockStarted?: boolean;
}

export interface ClockReading {
  turn: Side;
  whiteMs: number;
  blackMs: number;
  /** True when the side to move has already run out, as of `now`. */
  flagged: boolean;
  /** False while the game is waiting for White to begin. */
  ticking: boolean;
}

export function sideToMove(fen: string): Side {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/** "900+10" → 15 minutes with a 10-second increment. */
export function parseTimeControl(tc: string): { initialMs: number; incrementMs: number } {
  const [baseRaw, incRaw] = (tc ?? "").split("+");
  const base = Number(baseRaw);
  const inc = Number(incRaw);
  return {
    initialMs: Number.isFinite(base) && base > 0 ? Math.round(base * 1000) : 900_000,
    incrementMs: Number.isFinite(inc) && inc >= 0 ? Math.round(inc * 1000) : 0,
  };
}

/** What both clocks read right now, with the mover's time already ticking down. */
export function readClocks(g: ClockBearing, now: number = Date.now()): ClockReading {
  const turn = sideToMove(g.fen);
  const started = g.clockStarted ?? true;
  const ticking = g.status === "ACTIVE" && started;
  const elapsed = ticking ? Math.max(0, now - g.lastMoveAt.getTime()) : 0;

  const rawWhite = turn === "w" ? g.whiteMs - elapsed : g.whiteMs;
  const rawBlack = turn === "b" ? g.blackMs - elapsed : g.blackMs;

  return {
    turn,
    whiteMs: Math.max(0, rawWhite),
    blackMs: Math.max(0, rawBlack),
    flagged: ticking && (turn === "w" ? rawWhite : rawBlack) <= 0,
    ticking,
  };
}

/**
 * Who wins on time. Under FIDE 6.9 a flag-fall is a draw when the
 * player still running cannot possibly deliver mate.
 */
export function timeoutOutcome(fen: string): { result: string; endReason: string } {
  const flagged = sideToMove(fen);
  if (new Engine(fen).isInsufficientMaterial()) {
    return { result: "1/2-1/2", endReason: "timeout_vs_insufficient" };
  }
  return { result: flagged === "w" ? "0-1" : "1-0", endReason: "timeout" };
}
