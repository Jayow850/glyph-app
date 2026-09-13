// Money integrity: idempotency, balance integrity, no double-credit, reconciliation.
// Run: node --experimental-strip-types lib/test-money.ts
import { newLedger, creditPurchase, sendGift, requestPayout, reconcile, GIFTS, CREATOR_SHARE } from "./game/ledger.ts";

let pass = 0, fail = 0;
const t = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.log(`  ✗ ${name}`)); };

const L = newLedger();

// ---- purchase idempotency (Stripe webhook can fire twice) ----
t("purchase credits", creditPurchase(L, "pi_1", "fan", 100).ok);
t("duplicate payment-intent is a no-op", !creditPurchase(L, "pi_1", "fan", 100).ok);
t("balance credited exactly once", L.balances["fan"] === 100);
t("negative/zero amounts rejected", !creditPurchase(L, "pi_2", "fan", 0).ok && !creditPurchase(L, "pi_3", "fan", -5).ok);

// ---- gifting: atomic debit + creator share ----
t("queen gift (99) sends", sendGift(L, "tx_1", "fan", "streamer", "queen").ok);
t("sender debited", L.balances["fan"] === 1);
t("streamer earns 70% share", L.earned["streamer"] === Math.floor(99 * CREATOR_SHARE));
t("duplicate client txn cannot double-send", !sendGift(L, "tx_1", "fan", "streamer", "queen").ok && L.balances["fan"] === 1);
t("insufficient balance rejected", !sendGift(L, "tx_2", "fan", "streamer", "knight").ok);
t("unknown gift rejected", !sendGift(L, "tx_3", "fan", "streamer", "bishop").ok);

// ---- Brilliancy is gated behind an engine-confirmed brilliant move ----
creditPurchase(L, "pi_4", "whale", 1000);
const gated = sendGift(L, "tx_4", "whale", "streamer", "brilliancy");
t("brilliancy blocked without confirmation", !gated.ok && (gated as { error: string }).error === "gated");
t("brilliancy sends when confirmed", sendGift(L, "tx_5", "whale", "streamer", "brilliancy", true).ok);

// ---- payouts ----
const earned = L.earned["streamer"];
t("payout drains earned", requestPayout(L, "po_1", "streamer", earned).ok && L.earned["streamer"] === 0);
t("duplicate payout rejected", !requestPayout(L, "po_1", "streamer", earned).ok);
t("over-withdrawal rejected", !requestPayout(L, "po_2", "streamer", 1).ok);

// ---- reconciliation invariant: purchased = held + gifted ----
t("ledger reconciles to zero", reconcile(L));

// ---- concurrency simulation: 50 racing duplicate intents apply once ----
const R = newLedger();
creditPurchase(R, "pi_r", "racer", 10);
let applied = 0;
for (let i = 0; i < 50; i++) if (sendGift(R, "race_tx", "racer", "s", "pawn").ok) applied++;
t("50 racing duplicates → exactly 1 applies", applied === 1 && R.balances["racer"] === 9);
t("gift catalog sane", GIFTS.length === 6 && GIFTS.every((g) => g.coins > 0));

console.log(`\nmoney: ${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
