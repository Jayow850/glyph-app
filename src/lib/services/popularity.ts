import { redis } from "@/lib/redis";

/**
 * Live popularity: viewers + likes + gift-coins + watch-time drive a score
 * that ranks the Live tab (Redis sorted set) and decays so stale streams sink.
 */
const W = { viewers: 1, likes: 0.5, giftCoins: 2, watchMinutes: 0.2 };

export async function bumpPopularity(streamId: string, delta: Partial<Record<keyof typeof W, number>>) {
  const inc = Object.entries(delta).reduce((a, [k, v]) => a + (W[k as keyof typeof W] ?? 0) * (v ?? 0), 0);
  if (inc) await redis.zincrby("live:popularity", inc, streamId);
}
export async function hotStreams(limit = 20): Promise<{ id: string; score: number }[]> {
  const raw = await redis.zrevrange("live:popularity", 0, limit - 1, "WITHSCORES");
  const out: { id: string; score: number }[] = [];
  for (let i = 0; i < raw.length; i += 2) out.push({ id: raw[i], score: +raw[i + 1] });
  return out;
}
/** Halve all scores periodically (cron) so popularity is momentum, not history. */
export async function decayPopularity() {
  const all = await redis.zrange("live:popularity", 0, -1, "WITHSCORES");
  const pipe = redis.pipeline();
  for (let i = 0; i < all.length; i += 2) {
    const half = +all[i + 1] / 2;
    half < 1 ? pipe.zrem("live:popularity", all[i]) : pipe.zadd("live:popularity", half, all[i]);
  }
  await pipe.exec();
}
export async function topSupporters(_streamId: string) { /* GiftSend groupBy senderId — service in gifts.ts */ }
