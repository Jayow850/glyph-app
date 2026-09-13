// ============================================================
// GLYPH Chess Rules Engine — pure, deterministic, exhaustively testable.
// 0x88 board representation. This module is the single source of truth
// for legality on the server; the client runs the same rules for
// instant prediction, but the server's verdict always wins.
// Validated by perft (see lib/test-engine.ts).
// ============================================================

export type Color = "w" | "b";
export interface Move {
  from: number; to: number;
  piece: string; captured?: string; promotion?: string;
  flags: number; // 1 capture · 2 double-push · 4 en passant · 8 castle · 16 promotion
  san?: string;
}
interface Undo {
  move: Move; castling: number; ep: number; halfmove: number; key: string;
}

const F = { CAP: 1, DBL: 2, EP: 4, CASTLE: 8, PROMO: 16 };
const KNIGHT = [-33, -31, -18, -14, 14, 18, 31, 33];
const BISHOP = [-17, -15, 15, 17];
const ROOK = [-16, -1, 1, 16];
const KING = [...BISHOP, ...ROOK];
// castling-rights bits: 1 wK · 2 wQ · 4 bK · 8 bQ
const CASTLE_MASK: Record<number, number> = { 0: ~2, 4: ~3, 7: ~1, 112: ~8, 116: ~12, 119: ~4 };

const sqName = (i: number) => "abcdefgh"[i & 7] + String((i >> 4) + 1);
export const parseSquare = (s: string) => (parseInt(s[1]) - 1) * 16 + "abcdefgh".indexOf(s[0]);
const isWhite = (p: string) => p >= "A" && p <= "Z";

export class Engine {
  board = new Array<string>(128).fill(".");
  turn: Color = "w";
  castling = 0; ep = -1; halfmove = 0; fullmove = 1;
  private undos: Undo[] = [];
  private keys: string[] = []; // position keys for repetition

  constructor(fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") { this.loadFen(fen); }

  loadFen(fen: string) {
    this.board.fill("."); this.undos = []; this.keys = [];
    const [pos, turn, castle, ep, half, full] = fen.split(" ");
    let rank = 7, file = 0;
    for (const ch of pos) {
      if (ch === "/") { rank--; file = 0; }
      else if (/\d/.test(ch)) file += +ch;
      else { this.board[rank * 16 + file] = ch; file++; }
    }
    this.turn = (turn as Color) ?? "w";
    this.castling = (castle?.includes("K") ? 1 : 0) | (castle?.includes("Q") ? 2 : 0) | (castle?.includes("k") ? 4 : 0) | (castle?.includes("q") ? 8 : 0);
    this.ep = ep && ep !== "-" ? parseSquare(ep) : -1;
    this.halfmove = +half || 0; this.fullmove = +full || 1;
    this.keys.push(this.key());
  }

  fen(): string {
    let pos = "";
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.board[r * 16 + f];
        if (p === ".") empty++;
        else { if (empty) { pos += empty; empty = 0; } pos += p; }
      }
      if (empty) pos += empty;
      if (r) pos += "/";
    }
    const c = [(this.castling & 1) && "K", (this.castling & 2) && "Q", (this.castling & 4) && "k", (this.castling & 8) && "q"].filter(Boolean).join("") || "-";
    return `${pos} ${this.turn} ${c} ${this.ep >= 0 ? sqName(this.ep) : "-"} ${this.halfmove} ${this.fullmove}`;
  }
  private key() { return this.fen().split(" ").slice(0, 4).join(" "); } // repetition ignores counters

  private kingSq(color: Color): number {
    const k = color === "w" ? "K" : "k";
    for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } if (this.board[i] === k) return i; }
    return -1;
  }

  /** Is `sq` attacked by `by`? */
  attacked(sq: number, by: Color): boolean {
    const enemy = (p: string) => p !== "." && (by === "w") === isWhite(p);
    // pawns
    for (const d of by === "w" ? [-15, -17] : [15, 17]) {
      const s = sq + d;
      if (!(s & 0x88) && enemy(this.board[s]) && this.board[s].toLowerCase() === "p") return true;
    }
    for (const d of KNIGHT) {
      const s = sq + d;
      if (!(s & 0x88) && enemy(this.board[s]) && this.board[s].toLowerCase() === "n") return true;
    }
    for (const d of KING) {
      const s = sq + d;
      if (!(s & 0x88) && enemy(this.board[s]) && this.board[s].toLowerCase() === "k") return true;
    }
    for (const d of BISHOP) {
      let s = sq + d;
      while (!(s & 0x88)) {
        const p = this.board[s];
        if (p !== ".") { if (enemy(p) && (p.toLowerCase() === "b" || p.toLowerCase() === "q")) return true; break; }
        s += d;
      }
    }
    for (const d of ROOK) {
      let s = sq + d;
      while (!(s & 0x88)) {
        const p = this.board[s];
        if (p !== ".") { if (enemy(p) && (p.toLowerCase() === "r" || p.toLowerCase() === "q")) return true; break; }
        s += d;
      }
    }
    return false;
  }

  inCheck(color: Color = this.turn): boolean {
    return this.attacked(this.kingSq(color), color === "w" ? "b" : "w");
  }

  private pseudoMoves(): Move[] {
    const moves: Move[] = [];
    const us = this.turn, own = (p: string) => p !== "." && (us === "w") === isWhite(p);
    const add = (from: number, to: number, flags = 0, promotion?: string) =>
      moves.push({ from, to, piece: this.board[from], captured: this.board[to] !== "." ? this.board[to] : (flags & F.EP ? (us === "w" ? "p" : "P") : undefined), flags, promotion });
    const addPawn = (from: number, to: number, flags: number) => {
      const lastRank = us === "w" ? 7 : 0;
      if (to >> 4 === lastRank) for (const pr of us === "w" ? ["Q", "R", "B", "N"] : ["q", "r", "b", "n"]) add(from, to, flags | F.PROMO, pr);
      else add(from, to, flags);
    };
    for (let from = 0; from < 128; from++) {
      if (from & 0x88) { from += 7; continue; }
      const p = this.board[from];
      if (p === "." || !own(p)) continue;
      const t = p.toLowerCase();
      if (t === "p") {
        const dir = us === "w" ? 16 : -16, start = us === "w" ? 1 : 6;
        const one = from + dir;
        if (!(one & 0x88) && this.board[one] === ".") {
          addPawn(from, one, 0);
          const two = from + 2 * dir;
          if (from >> 4 === start && this.board[two] === ".") add(from, two, F.DBL);
        }
        for (const d of us === "w" ? [15, 17] : [-15, -17]) {
          const to = from + d;
          if (to & 0x88) continue;
          if (this.board[to] !== "." && !own(this.board[to])) addPawn(from, to, F.CAP);
          else if (to === this.ep) add(from, to, F.CAP | F.EP);
        }
      } else if (t === "n" || t === "k") {
        for (const d of t === "n" ? KNIGHT : KING) {
          const to = from + d;
          if (!(to & 0x88) && !own(this.board[to])) add(from, to, this.board[to] !== "." ? F.CAP : 0);
        }
        if (t === "k") {
          const home = us === "w" ? 0 : 112, them: Color = us === "w" ? "b" : "w";
          const [kBit, qBit] = us === "w" ? [1, 2] : [4, 8];
          if (from === home + 4) {
            if ((this.castling & kBit) && this.board[home + 5] === "." && this.board[home + 6] === "." &&
                !this.attacked(home + 4, them) && !this.attacked(home + 5, them) && !this.attacked(home + 6, them))
              add(from, home + 6, F.CASTLE);
            if ((this.castling & qBit) && this.board[home + 3] === "." && this.board[home + 2] === "." && this.board[home + 1] === "." &&
                !this.attacked(home + 4, them) && !this.attacked(home + 3, them) && !this.attacked(home + 2, them))
              add(from, home + 2, F.CASTLE);
          }
        }
      } else {
        const dirs = t === "b" ? BISHOP : t === "r" ? ROOK : KING; // q uses all 8
        for (const d of dirs) {
          let to = from + d;
          while (!(to & 0x88)) {
            if (this.board[to] === ".") add(from, to, 0);
            else { if (!own(this.board[to])) add(from, to, F.CAP); break; }
            to += d;
          }
        }
      }
    }
    return moves;
  }

  make(m: Move) {
    this.undos.push({ move: m, castling: this.castling, ep: this.ep, halfmove: this.halfmove, key: this.key() });
    const us = this.turn;
    this.board[m.to] = m.promotion ?? m.piece;
    this.board[m.from] = ".";
    if (m.flags & F.EP) this.board[m.to + (us === "w" ? -16 : 16)] = ".";
    if (m.flags & F.CASTLE) {
      if ((m.to & 7) === 6) { this.board[m.to - 1] = this.board[m.to + 1]; this.board[m.to + 1] = "."; }
      else { this.board[m.to + 1] = this.board[m.to - 2]; this.board[m.to - 2] = "."; }
    }
    if (CASTLE_MASK[m.from] !== undefined) this.castling &= CASTLE_MASK[m.from];
    if (CASTLE_MASK[m.to] !== undefined) this.castling &= CASTLE_MASK[m.to];
    this.ep = m.flags & F.DBL ? m.from + (us === "w" ? 16 : -16) : -1;
    this.halfmove = (m.piece.toLowerCase() === "p" || (m.flags & F.CAP)) ? 0 : this.halfmove + 1;
    if (us === "b") this.fullmove++;
    this.turn = us === "w" ? "b" : "w";
    this.keys.push(this.key());
  }

  undo() {
    const u = this.undos.pop(); if (!u) return;
    this.keys.pop();
    const m = u.move;
    this.turn = this.turn === "w" ? "b" : "w";
    const us = this.turn;
    this.board[m.from] = m.piece;
    this.board[m.to] = ".";
    if (m.flags & F.EP) this.board[m.to + (us === "w" ? -16 : 16)] = m.captured!;
    else if (m.captured) this.board[m.to] = m.captured;
    if (m.flags & F.CASTLE) {
      if ((m.to & 7) === 6) { this.board[m.to + 1] = this.board[m.to - 1]; this.board[m.to - 1] = "."; }
      else { this.board[m.to - 2] = this.board[m.to + 1]; this.board[m.to + 1] = "."; }
    }
    this.castling = u.castling; this.ep = u.ep; this.halfmove = u.halfmove;
    if (us === "b") this.fullmove--;
  }

  legalMoves(): Move[] {
    return this.pseudoMoves().filter((m) => {
      this.make(m);
      const ok = !this.attacked(this.kingSq(this.turn === "w" ? "b" : "w"), this.turn);
      this.undo();
      return ok;
    });
  }

  /** Validate + apply a move intent. Returns the applied move (with SAN) or null if illegal. */
  move(from: number, to: number, promotion?: string): Move | null {
    const m = this.legalMoves().find((x) => x.from === from && x.to === to &&
      (!(x.flags & F.PROMO) || x.promotion?.toLowerCase() === (promotion ?? "q").toLowerCase()));
    if (!m) return null;
    m.san = this.san(m);
    this.make(m);
    if (this.inCheck()) m.san += this.legalMoves().length === 0 ? "#" : "+";
    return m;
  }

  private san(m: Move): string {
    if (m.flags & F.CASTLE) return (m.to & 7) === 6 ? "O-O" : "O-O-O";
    const t = m.piece.toLowerCase();
    let s = "";
    if (t !== "p") {
      s = m.piece.toUpperCase();
      const others = this.legalMoves().filter((x) => x.to === m.to && x.piece === m.piece && x.from !== m.from);
      if (others.length) {
        const sameFile = others.some((x) => (x.from & 7) === (m.from & 7));
        const sameRank = others.some((x) => x.from >> 4 === m.from >> 4);
        if (!sameFile) s += "abcdefgh"[m.from & 7];
        else if (!sameRank) s += String((m.from >> 4) + 1);
        else s += sqName(m.from);
      }
    } else if (m.flags & F.CAP) s = "abcdefgh"[m.from & 7];
    if (m.flags & F.CAP) s += "x";
    s += sqName(m.to);
    if (m.promotion) s += "=" + m.promotion.toUpperCase();
    return s;
  }

  // ---- game status & draws ----
  isCheckmate() { return this.inCheck() && this.legalMoves().length === 0; }
  isStalemate() { return !this.inCheck() && this.legalMoves().length === 0; }
  isFiftyMove() { return this.halfmove >= 100; }
  isThreefold() {
    const k = this.key();
    return this.keys.filter((x) => x === k).length >= 3;
  }
  isInsufficientMaterial() {
    const pieces: { p: string; sq: number }[] = [];
    for (let i = 0; i < 128; i++) {
      if (i & 0x88) { i += 7; continue; }
      if (this.board[i] !== ".") pieces.push({ p: this.board[i].toLowerCase(), sq: i });
    }
    const minors = pieces.filter((x) => x.p === "b" || x.p === "n");
    if (pieces.some((x) => x.p === "q" || x.p === "r" || x.p === "p")) return false;
    if (minors.length === 0) return true;                    // K vs K
    if (minors.length === 1) return true;                    // K+B/N vs K
    if (minors.length === 2 && minors.every((x) => x.p === "b")) {
      const shade = (x: { sq: number }) => ((x.sq >> 4) + (x.sq & 7)) & 1;
      return shade(minors[0]) === shade(minors[1]);          // same-colored bishops
    }
    return false;
  }
  status(): "active" | "checkmate" | "stalemate" | "fifty" | "threefold" | "material" {
    if (this.isCheckmate()) return "checkmate";
    if (this.isStalemate()) return "stalemate";
    if (this.isInsufficientMaterial()) return "material";
    if (this.isFiftyMove()) return "fifty";
    if (this.isThreefold()) return "threefold";
    return "active";
  }

  /** PGN of the game so far — every finished game is one tap from a Game post. */
  pgn(headers: Record<string, string> = {}): string {
    const sans = this.undos.map((u) => u.move.san ?? "?");
    const result = headers.Result ?? "*";
    const h = Object.entries({ Event: "GLYPH game", Date: new Date().toISOString().slice(0, 10).replace(/-/g, "."), ...headers, Result: result })
      .map(([k, v]) => `[${k} "${v}"]`).join("\n");
    let body = "";
    sans.forEach((s, i) => { if (i % 2 === 0) body += `${i / 2 + 1}. `; body += s + " "; });
    return `${h}\n\n${body.trim()} ${result}`.trim();
  }

  perft(depth: number): number {
    if (depth === 0) return 1;
    let n = 0;
    for (const m of this.legalMoves()) { this.make(m); n += this.perft(depth - 1); this.undo(); }
    return n;
  }
}
