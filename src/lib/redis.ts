import Redis from "ioredis";

/**
 * Redis is an accelerator, never a dependency.
 *
 * If REDIS_URL is unset, or the server is unreachable (which is exactly
 * what happens on Vercel when the value still points at a local Docker
 * container), every call here quietly does nothing instead of throwing.
 * A cache that can take the whole site down is worse than no cache.
 */
const url = process.env.REDIS_URL;

function connect(): Redis | null {
  if (!url) return null;
  try {
    const c = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    });
    // Swallow connection noise; every call site handles its own failure.
    c.on("error", () => {});
    c.connect().catch(() => {});
    return c;
  } catch {
    return null;
  }
}

const client = connect();

/**
 * Every Redis command, wrapped so a dead connection resolves to null
 * rather than throwing. Written as a proxy so adding a command upstream
 * never means editing this file — `publish`, `lpush`, `sadd`, whatever
 * a service reaches for, all behave the same way.
 */
type SafeRedis = {
  [command: string]: (...args: unknown[]) => Promise<unknown>;
};

function safeClient(): SafeRedis {
  return new Proxy({} as SafeRedis, {
    get(_target, command) {
      // Keep the object inert to awaiting and to symbol lookups.
      if (typeof command !== "string" || command === "then") return undefined;

      return async (...args: unknown[]): Promise<unknown> => {
        if (!client) return null;
        const fn = (client as unknown as Record<string, unknown>)[command];
        if (typeof fn !== "function") return null;
        try {
          return await (fn as (...a: unknown[]) => Promise<unknown>).apply(client, args);
        } catch {
          return null;
        }
      };
    },
  });
}

export const redis = safeClient();
export const redisPub = safeClient();
export const redisSub = safeClient();

/** Cache helper with TTL. Falls through to `fn` whenever Redis misbehaves. */
export async function cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  if (!client) return fn();

  try {
    const hit = await client.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    return fn();
  }

  const val = await fn();
  try {
    await client.set(key, JSON.stringify(val), "EX", ttlSec);
  } catch {
    /* the value is still correct; it just isn't cached */
  }
  return val;
}

export async function invalidate(prefix: string): Promise<void> {
  if (!client) return;
  try {
    const keys = await client.keys(`${prefix}*`);
    if (keys.length) await client.del(...keys);
  } catch {
    /* best effort */
  }
}
