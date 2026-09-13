// ============================================================
// Gift/coin ledger core — pure functions so money logic is
// exhaustively testable. Every mutation is idempotent by key;
// no path can double-charge or double-credit. The Prisma layer
// wraps these in a transaction (src/lib/services/gifts.ts).
// ============================================================
export const GIFTS = [
  { key: "pawn", glyph: "♟", name: "Golden Pawn", coins: 1 },
  { key: "knight", glyph: "♞", name: "Knight Fork", coins: 10 },
  { key: "rook", glyph: "♜", name: "Rook Lift", coins: 25 },
  { key: "queen", glyph: "♛", name: "Golden Queen", coins: 99 },
  { key: "crown", glyph: "♔", name: "Crown", coins: 250 },
  { key: "brilliancy", glyph: "✦", name: "Brilliancy", coins: 500, gated: true }, // unlocks only on engine-confirmed brilliant move
] as const;
export const CREATOR_SHARE = 0.7; // streamer 70% · platform 30%

export interface LedgerState {
  balances: Record<string, number>;       // userId → coins
  earned: Record<string, number>;         // streamerId → payout-eligible coins
  appliedKeys: Set<string>;               // idempotency
  log: { key: string; kind: string; userId: string; delta: number }[];
}
export const newLedger = (): LedgerState => ({ balances: {}, earned: {}, appliedKeys: new Set(), log: [] });

export type LedgerResult = { ok: true; state: LedgerState } | { ok: false; error: "duplicate" | "insufficient" | "bad_amount" | "gated" };

/** Coin purchase (post-Stripe-confirmation). Idempotent by payment-intent id. */
export function creditPurchase(s: LedgerState, key: string, userId: string, coins: number): LedgerResult {
  if (s.appliedKeys.has(key)) return { ok: false, error: "duplicate" };
  if (!Number.isInteger(coins) || coins <= 0) return { ok: false, error: "bad_amount" };
  s.appliedKeys.add(key);
  s.balances[userId] = (s.balances[userId] ?? 0) + coins;
  s.log.push({ key, kind: "PURCHASE", userId, delta: coins });
  return { ok: true, state: s };
}

/** Send a gift: atomic debit sender + credit streamer share. Idempotent by client txn id. */
export function sendGift(s: LedgerState, key: string, senderId: string, streamerId: string, giftKey: string, brilliantConfirmed = false): LedgerResult {
  if (s.appliedKeys.has(key)) return { ok: false, error: "duplicate" };
  const gift = GIFTS.find((g) => g.key === giftKey);
  if (!gift) return { ok: false, error: "bad_amount" };
  if ((gift as { gated?: boolean }).gated && !brilliantConfirmed) return { ok: false, error: "gated" };
  if ((s.balances[senderId] ?? 0) < gift.coins) return { ok: false, error: "insufficient" };
  s.appliedKeys.add(key);
  s.balances[senderId] -= gift.coins;
  s.earned[streamerId] = (s.earned[streamerId] ?? 0) + Math.floor(gift.coins * CREATOR_SHARE);
  s.log.push({ key, kind: "GIFT", userId: senderId, delta: -gift.coins });
  return { ok: true, state: s };
}

/** Payout request: drains earned balance. Idempotent. */
export function requestPayout(s: LedgerState, key: string, streamerId: string, coins: number): LedgerResult {
  if (s.appliedKeys.has(key)) return { ok: false, error: "duplicate" };
  if (!Number.isInteger(coins) || coins <= 0 || (s.earned[streamerId] ?? 0) < coins) return { ok: false, error: "insufficient" };
  s.appliedKeys.add(key);
  s.earned[streamerId] -= coins;
  s.log.push({ key, kind: "PAYOUT", userId: streamerId, delta: -coins });
  return { ok: true, state: s };
}

/** Reconciliation invariant: purchases − balances − spends must net to zero. */
export function reconcile(s: LedgerState): boolean {
  const purchased = s.log.filter((l) => l.kind === "PURCHASE").reduce((a, b) => a + b.delta, 0);
  const held = Object.values(s.balances).reduce((a, b) => a + b, 0);
  const gifted = -s.log.filter((l) => l.kind === "GIFT").reduce((a, b) => a + b.delta, 0);
  return purchased === held + gifted;
}
