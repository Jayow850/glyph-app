import Redis from "ioredis";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";
export const redis = new Redis(url);
export const redisPub = new Redis(url);
export const redisSub = new Redis(url);

// Cache helper with TTL — used for leaderboards & public club pages
export async function cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;
  const val = await fn();
  await redis.set(key, JSON.stringify(val), "EX", ttlSec);
  return val;
}
export async function invalidate(prefix: string) {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length) await redis.del(...keys);
}
