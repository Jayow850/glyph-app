import { prisma } from "@/lib/prisma";
import { GIFTS, CREATOR_SHARE } from "../../../lib/game/ledger.ts";

/**
 * Prisma wrapper around the pure ledger (lib/game/ledger.ts — fully unit-tested).
 * Everything runs in one transaction; idempotency via unique idemKey; the
 * client is never trusted for a balance.
 */
export async function sendGiftTxn(p: { senderId: string; streamId: string; giftKey: string; clientTxnId: string; brilliantConfirmed?: boolean }) {
  const gift = GIFTS.find((g) => g.key === p.giftKey);
  if (!gift) return { ok: false as const, error: "unknown_gift" };
  if ((gift as { gated?: boolean }).gated && !p.brilliantConfirmed) return { ok: false as const, error: "gated" };
  try {
    const res = await prisma.$transaction(async (tx) => {
      const stream = await tx.liveStream.findUniqueOrThrow({ where: { id: p.streamId } });
      if (stream.status !== "LIVE" || stream.giftsDisabled) throw new Error("gifts_closed");
      const wallet = await tx.wallet.findUnique({ where: { userId: p.senderId } });
      if (!wallet || wallet.coins < gift.coins) throw new Error("insufficient");
      // idemKey unique constraint = the concurrency guard: a racing duplicate throws P2002
      await tx.coinTxn.create({ data: { userId: p.senderId, delta: -gift.coins, kind: "GIFT_SENT", refId: p.streamId, idemKey: p.clientTxnId } });
      await tx.wallet.update({ where: { userId: p.senderId }, data: { coins: { decrement: gift.coins } } });
      const share = Math.floor(gift.coins * CREATOR_SHARE);
      await tx.coinTxn.create({ data: { userId: stream.hostId, delta: share, kind: "GIFT_EARNED", refId: p.streamId, idemKey: `${p.clientTxnId}:earn` } });
      await tx.wallet.upsert({ where: { userId: stream.hostId }, update: { earned: { increment: share } }, create: { userId: stream.hostId, coins: 0, earned: share } });
      await tx.giftSend.create({ data: { streamId: p.streamId, senderId: p.senderId, streamerId: stream.hostId, gift: p.giftKey, coins: gift.coins } });
      await tx.liveStream.update({ where: { id: p.streamId }, data: { giftCoins: { increment: gift.coins } } });
      return { coins: gift.coins };
    });
    return { ok: true as const, coins: res.coins };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    if (msg.includes("P2002") || (e as { code?: string })?.code === "P2002") return { ok: false as const, error: "duplicate" };
    return { ok: false as const, error: msg === "insufficient" ? "insufficient" : msg === "gifts_closed" ? "gifts_closed" : "failed" };
  }
}

/** Stripe-confirmed coin purchase — idempotent by payment-intent id. */
export async function creditCoinPurchase(userId: string, paymentIntentId: string, coins: number) {
  try {
    await prisma.$transaction([
      prisma.coinTxn.create({ data: { userId, delta: coins, kind: "PURCHASE", refId: paymentIntentId, idemKey: paymentIntentId } }),
      prisma.wallet.upsert({ where: { userId }, update: { coins: { increment: coins } }, create: { userId, coins, earned: 0 } }),
    ]);
    return { ok: true as const };
  } catch { return { ok: false as const, error: "duplicate" }; } // webhook retries are safe
}
