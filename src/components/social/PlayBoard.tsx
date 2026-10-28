"use client";

import { useRef, useState, useEffect, useCallback, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Piece } from "./Pieces";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

/** Below this, a pointer press is a tap. Above it, it is a drag. */
const DRAG_THRESHOLD = 5;

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
  bare = false,
  onBrowse,
  animMs = 90,
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
  /** Drop the frame entirely so the board can run edge to edge. */
  bare?: boolean;
  /**
   * Step through the game by swiping across the board: -1 back, +1 on.
   *
   * Only wired up while `disabled`, which is the point. When it is your
   * move a horizontal drag means "carry this piece", and a gesture that
   * sometimes moves a piece and sometimes rewinds the game is worse
   * than no gesture. When you cannot move — the opponent's turn, a
   * finished game, a spectator — the board has nothing else to do with
   * a swipe.
   */
  onBrowse?: (direction: -1 | 1) => void;
  /** How long a piece takes to travel. 0 disables the animation. */
  animMs?: number;
}) {
  // One flat board, indexed the same way regardless of which side is
  // looking at it. Flipping is purely a rendering concern: square 0 is
  // always a8, so every caller keeps working in one coordinate system.
  const squares = frame.join("").split("");
  const key = squares.join("");

  /**
   * Pieces travel to their new square instead of teleporting.
   *
   * The board re-renders from a FEN, which carries no notion of which
   * piece went where — so the move is recovered by diffing the two
   * positions: a square that emptied and a square that filled with the
   * same piece are the same piece, and the difference between them is
   * the distance to cover. That handles captures and castling (two
   * pieces, matched separately by code) and correctly declines to
   * animate a promotion, where the piece that lands is not the piece
   * that left.
   *
   * The travel is then one CSS animation from an offset back to zero,
   * which the compositor runs on its own thread — no per-frame React
   * work while a clock is ticking.
   */
  const prevRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const [slides, setSlides] = useState<Record<number, { dx: number; dy: number; seq: number }>>({});

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = key;
    if (!prev || prev.length !== 64 || animMs <= 0) return;

    const emptied: number[] = [];
    const filled: number[] = [];
    for (let i = 0; i < 64; i++) {
      if (prev[i] === key[i]) continue;
      if (key[i] === ".") emptied.push(i);
      else filled.push(i);
    }
    // More than a castling's worth of change is a jump through the move
    // list, not a move. Those should not slide.
    if (emptied.length === 0 || filled.length === 0 || emptied.length > 2 || filled.length > 2) {
      setSlides({});
      return;
    }

    const next: Record<number, { dx: number; dy: number; seq: number }> = {};
    const pool = [...emptied];
    for (const to of filled) {
      const at = pool.findIndex((f) => prev[f] === key[to]);
      if (at === -1) continue;                       // a promotion: nothing to carry
      const from = pool.splice(at, 1)[0];
      const dFrom = flipped ? 63 - from : from;
      const dTo = flipped ? 63 - to : to;
      next[to] = {
        dx: (dFrom % 8) - (dTo % 8),
        dy: Math.floor(dFrom / 8) - Math.floor(dTo / 8),
        seq: ++seqRef.current,
      };
    }
    setSlides(next);
  }, [key, flipped, animMs]);

  const gridRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<{ from: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  // Dragging is deliberately not a library. A chess drag is one piece,
  // one surface, no reordering and no drop zones — the pointer events
  // are the whole implementation, and they behave identically under a
  // mouse, a finger and a stylus.
  const [drag, setDrag] = useState<{ from: number; x: number; y: number; size: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

  /** The absolute square under a viewport point, or null if off the board. */
  const squareAtPoint = useCallback((clientX: number, clientY: number): number | null => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const d = row * 8 + col;
    return flipped ? 63 - d : d;
  }, [flipped]);

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>, idx: number) {
    if (disabled || e.button !== 0) return;
    if (squares[idx] === ".") return;           // nothing to pick up
    originRef.current = { from: idx, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const origin = originRef.current;
    if (!origin) return;

    if (!drag) {
      const far = Math.hypot(e.clientX - origin.x, e.clientY - origin.y) >= DRAG_THRESHOLD;
      if (!far) return;
      // Crossing the threshold is also what selects the piece, so the
      // legal-move dots appear under the hand as it lifts.
      if (selected !== origin.from) onSquare(origin.from);
      const rect = gridRef.current?.getBoundingClientRect();
      setDrag({ from: origin.from, x: e.clientX, y: e.clientY, size: (rect?.width ?? 320) / 8 });
    } else {
      setDrag({ ...drag, x: e.clientX, y: e.clientY });
    }
    setHover(squareAtPoint(e.clientX, e.clientY));
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const origin = originRef.current;
    originRef.current = null;

    if (!drag) return;                           // a plain tap; let click handle it
    const dropped = squareAtPoint(e.clientX, e.clientY);
    setDrag(null);
    setHover(null);
    suppressClick.current = true;                // the click after a drag is not a tap

    if (origin && dropped !== null && dropped !== origin.from && targets.includes(dropped)) {
      onSquare(dropped);
    }
    // Put back on its own square, or dropped somewhere illegal: the piece
    // stays selected and nothing is sent. A board behaves the same way.
  }

  const SWIPE_MIN = 44;

  function swipeStart(e: ReactPointerEvent<HTMLDivElement>) {
    swipeRef.current = disabled && onBrowse ? { x: e.clientX, y: e.clientY } : null;
  }

  function swipeEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const from = swipeRef.current;
    swipeRef.current = null;
    if (!from || !onBrowse) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    // Horizontal, and decisively so — a diagonal drag is an accident.
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    onBrowse(dx < 0 ? 1 : -1);   // drag the board left to go forward
  }

  function handleClick(idx: number) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    onSquare(idx);
  }

  return (
    <div
      style={
        bare
          ? { width: "100%", height: "100%", boxSizing: "border-box" }
          : {
              width: "100%",
              borderRadius: 14,
              padding: 6,
              // The frame is chrome, so it follows the theme. The squares
              // inside it do not — a board is an object, not a surface.
              background: "var(--surface-2)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
              border: "1px solid var(--border-gold)",
              boxSizing: "border-box",
            }
      }
    >
      <div
        ref={gridRef}
        onPointerDown={swipeStart}
        onPointerUp={swipeEnd}
        onPointerCancel={() => { swipeRef.current = null; }}
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gridTemplateRows: "repeat(8, 1fr)",
          borderRadius: bare ? 0 : 8,
          overflow: "hidden",
          containerType: "inline-size",
          boxShadow: bare ? "none" : "inset 0 0 0 1px rgba(0,0,0,0.35)",
          // A finger dragging a piece must not also scroll the page.
          touchAction: "none",
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
          const isSource = drag?.from === idx;
          const isHovered = drag !== null && hover === idx && targets.includes(idx);

          const base = dark ? "var(--sq-dark, #5E7A63)" : "var(--sq-light, #D3DAC9)";
          const ink = dark ? "var(--sq-light, #D3DAC9)" : "var(--sq-dark, #5E7A63)";

          return (
            <button
              key={d}
              onClick={() => handleClick(idx)}
              onPointerDown={(e) => handlePointerDown(e, idx)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => { originRef.current = null; setDrag(null); setHover(null); }}
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
                touchAction: "none",
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

              {ch !== "." && (() => {
                const slide = slides[idx];
                return (
                  <span
                    // A new key restarts the animation; without it React
                    // reuses the element and the piece never moves again.
                    key={slide ? `s${slide.seq}` : "still"}
                    className={slide && !isSource ? "piece-slide" : undefined}
                    style={{
                      position: "relative", display: "grid", placeItems: "center",
                      width: "100%", height: "100%", zIndex: slide ? 2 : 1,
                      // The piece in hand is drawn under the pointer, not here.
                      opacity: isSource ? 0.22 : 1,
                      ...(slide
                        ? ({
                            "--dx": `${slide.dx * 100}%`,
                            "--dy": `${slide.dy * 100}%`,
                            "--piece-ms": `${animMs}ms`,
                          } as CSSProperties)
                        : null),
                    }}
                  >
                    <Piece code={ch} />
                  </span>
                );
              })()}

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

              {/* the square a dropped piece would land on */}
              {isHovered && (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    boxSizing: "border-box",
                    border: "1.4cqw solid rgba(245,241,232,0.9)",
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

      {/* The piece in hand. Fixed to the viewport and slightly enlarged,
          so it reads as lifted off the board rather than sliding on it. */}
      {drag && squares[drag.from] !== "." && (
        <div
          style={{
            position: "fixed",
            left: drag.x,
            top: drag.y,
            width: drag.size * 1.14,
            height: drag.size * 1.14,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 90,
            filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.55))",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Piece code={squares[drag.from]} />
        </div>
      )}
    </div>
  );
}
