// ============================================================
// Server-authoritative game loop. The server owns position, clocks,
// and results. Clients send move INTENTS; the server validates with
// its own engine and its verdict always wins. Clocks are computed
// from server timestamps — client clocks are display-only.
// Pure class (no DB imports) so it is fully unit-testable; persistence
// and broadcast are injected as callbacks.
// ============================================================
import { Engine, type Move } from "./engine";

export type EndReason = "checkmate" | "stalemate" | "timeout" | "resign" | "draw_agreed" | "fifty" | "threefold" | "material" | "abort" | "abandoned";
export interface GameConfig {
  id: string; whiteId: string; blackId: string;
  initialMs: number; incrementMs: number; rated: boolean;
  startFen?: string;
  now?: () => number; // injectable clock for tests
}
export interface GameSnapshot {
  id: string; fen: string; turn: "w" | "b"; moveCount: number;
  clocks: { w: number; b: number }; status: "active" | "finished";
  result?: string; endReason?: EndReason; sans: string[];
  drawOffer?: "w" | "b" | null; lastMoveAt: number;
}
export type Verdict =
  | { ok: true; move: Move; snapshot: GameSnapshot; finished?: { result: string; reason: EndReason } }
  | { ok: false; error: "not_your_turn" | "illegal" | "finished" | "stale_seq" | "flagged" | "not_in_game"; snapshot: GameSnapshot };

export class GlyphGame {
  private eng: Engine;
  private clocks: { w: number; b: number };
  private lastMoveAt: number;
  private sans: string[] = [];
  private finished = false;
  private result?: string; private endReason?: EndReason;
  private drawOffer: "w" | "b" | null = null;
  private now: () => number;

  cfg: GameConfig;
  constructor(cfg: GameConfig) {
    this.cfg = cfg;
    this.eng = new Engine(cfg.startFen);
    this.clocks = { w: cfg.initialMs, b: cfg.initialMs };
    this.now = cfg.now ?? Date.now;
    this.lastMoveAt = this.now();
  }

  private colorOf(userId: string): "w" | "b" | null {
    return userId === this.cfg.whiteId ? "w" : userId === this.cfg.blackId ? "b" : null;
  }

  /** Remaining time for the side to move, as of now — flag detection lives here. */
  private remaining(side: "w" | "b"): number {
    const base = this.clocks[side];
    return side === this.eng.turn && !this.finished ? base - (this.now() - this.lastMoveAt) : base;
  }

  snapshot(): GameSnapshot {
    return {
      id: this.cfg.id, fen: this.eng.fen(), turn: this.eng.turn,
      moveCount: this.sans.length,
      clocks: { w: Math.max(0, this.remaining("w")), b: Math.max(0, this.remaining("b")) },
      status: this.finished ? "finished" : "active",
      result: this.result, endReason: this.endReason,
      sans: [...this.sans], drawOffer: this.drawOffer, lastMoveAt: this.lastMoveAt,
    };
  }

  private finish(result: string, reason: EndReason) {
    this.finished = true; this.result = result; this.endReason = reason;
  }

  /** Check the mover's flag BEFORE applying anything — server timestamp decides move-vs-flag races. */
  private flagCheck(): boolean {
    const side = this.eng.turn;
    if (this.remaining(side) <= 0) {
      this.clocks[side] = 0;
      // timeout vs insufficient material on the other side = draw (FIDE)
      const winner = side === "w" ? "b" : "w";
      this.finish(this.eng.isInsufficientMaterial() ? "1/2-1/2" : winner === "w" ? "1-0" : "0-1", "timeout");
      return true;
    }
    return false;
  }

  /**
   * Apply a move intent. `seq` must equal the current move count — this
   * rejects duplicate/replayed intents (idempotency) and out-of-date clients.
   */
  moveIntent(userId: string, seq: number, from: number, to: number, promotion?: string): Verdict {
    const color = this.colorOf(userId);
    if (!color) return { ok: false, error: "not_in_game", snapshot: this.snapshot() };
    if (this.finished) return { ok: false, error: "finished", snapshot: this.snapshot() };
    if (seq !== this.sans.length) return { ok: false, error: "stale_seq", snapshot: this.snapshot() };
    if (color !== this.eng.turn) return { ok: false, error: "not_your_turn", snapshot: this.snapshot() };
    if (this.flagCheck()) return { ok: false, error: "flagged", snapshot: this.snapshot() };

    const elapsed = this.now() - this.lastMoveAt;
    const m = this.eng.move(from, to, promotion);
    if (!m) return { ok: false, error: "illegal", snapshot: this.snapshot() };

    this.clocks[color] = this.clocks[color] - elapsed + this.cfg.incrementMs;
    this.lastMoveAt = this.now();
    this.sans.push(m.san!);
    this.drawOffer = null; // any move voids a pending offer

    const st = this.eng.status();
    let fin: { result: string; reason: EndReason } | undefined;
    if (st === "checkmate") { const r = color === "w" ? "1-0" : "0-1"; this.finish(r, "checkmate"); fin = { result: r, reason: "checkmate" }; }
    else if (st !== "active") { this.finish("1/2-1/2", st as EndReason); fin = { result: "1/2-1/2", reason: st as EndReason }; }
    return { ok: true, move: m, snapshot: this.snapshot(), finished: fin };
  }

  resign(userId: string): GameSnapshot {
    const c = this.colorOf(userId);
    if (c && !this.finished) this.finish(c === "w" ? "0-1" : "1-0", "resign");
    return this.snapshot();
  }
  offerDraw(userId: string): GameSnapshot {
    const c = this.colorOf(userId);
    if (c && !this.finished) {
      if (this.drawOffer && this.drawOffer !== c) this.finish("1/2-1/2", "draw_agreed");
      else this.drawOffer = c;
    }
    return this.snapshot();
  }
  /** Heartbeat tick — flags a player who ran out while thinking. */
  tick(): GameSnapshot { if (!this.finished) this.flagCheck(); return this.snapshot(); }
  abandon(): GameSnapshot { if (!this.finished) this.finish(this.eng.turn === "w" ? "0-1" : "1-0", "abandoned"); return this.snapshot(); }

  pgn(headers: Record<string, string> = {}) {
    return this.eng.pgn({ ...headers, Result: this.result ?? "*" });
  }
}
