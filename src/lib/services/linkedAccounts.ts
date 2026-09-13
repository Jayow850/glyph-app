import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/** AES-256-GCM at rest. Key from env — never log, never ship client-side. */
const KEY = crypto.createHash("sha256").update(process.env.LINK_ENC_KEY ?? "dev-only-rotate-me").digest();
export function enc(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const out = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), out]).toString("base64");
}
export function dec(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", KEY, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

export class RateLimited extends Error { retryAfterMs = 60_000; }

/** Lichess: ratings live in perfs. 429 → back off a full minute (per docs, July 2026). */
export async function fetchLichess(username: string, token?: string) {
  const res = await fetch(`https://lichess.org/api/user/${encodeURIComponent(username)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 429) throw new RateLimited();
  if (!res.ok) throw new Error(`lichess ${res.status}`);
  const u = await res.json();
  const p = u.perfs ?? {};
  return {
    ratings: {
      rapid: p.rapid?.rating ?? null, blitz: p.blitz?.rating ?? null,
      bullet: p.bullet?.rating ?? null, classical: p.classical?.rating ?? null,
      puzzle: p.puzzle?.rating ?? null,
    },
    title: u.title ?? null, // GM/IM/FM — verification-gated import
    username: u.username as string,
  };
}
/** Lichess /api/account — identifies the token owner after OAuth. Tokens can be up to 512 chars. */
export async function fetchLichessAccount(token: string) {
  const res = await fetch("https://lichess.org/api/account", { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) throw new RateLimited();
  if (!res.ok) throw new Error(`lichess account ${res.status}`);
  return res.json();
}

/** Chess.com PubAPI — read-only, no OAuth, caches ~12–24h. Serial + gzip = polite. */
const CC = { headers: { "Accept-Encoding": "gzip", "User-Agent": "GLYPH (contact: admin@glyph.gg)" } };
export async function fetchChessComProfile(username: string) {
  const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}`, CC);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`chess.com ${res.status}`);
  return res.json(); // { location, name, url, avatar }
}
export async function fetchChessComStats(username: string) {
  const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username.toLowerCase())}/stats`, CC);
  if (!res.ok) throw new Error(`chess.com stats ${res.status}`);
  const s = await res.json();
  return {
    rapid: s.chess_rapid?.last?.rating ?? null, blitz: s.chess_blitz?.last?.rating ?? null,
    bullet: s.chess_bullet?.last?.rating ?? null, daily: s.chess_daily?.last?.rating ?? null,
    tactics: s.tactics?.highest?.rating ?? null,
  };
}

/** Push the verified rating onto the user's GLYPH Rating rows with full provenance. */
export async function applyVerifiedRatings(userId: string, provider: "LICHESS" | "CHESSCOM", ratings: Record<string, number | null>) {
  const profile = await prisma.profile.findUnique({ where: { userId } });
  const key = profile?.primaryRatingKey ?? "rapid";
  const primary = ratings[key];
  if (typeof primary === "number") {
    await prisma.rating.upsert({
      where: { userId_clubId_timeControl: { userId, clubId: null as never, timeControl: key.toUpperCase() as never } },
      update: { current: primary, peak: { increment: 0 }, provisional: false, verified: true, verifySource: provider },
      create: { userId, timeControl: key.toUpperCase() as never, current: primary, peak: primary, provisional: false, verified: true, verifySource: provider },
    }).catch(async () => {
      // composite-null upsert quirk in some Prisma versions → fall back to updateMany
      await prisma.rating.updateMany({
        where: { userId, clubId: null, timeControl: key.toUpperCase() as never },
        data: { current: primary, provisional: false, verified: true, verifySource: provider },
      });
    });
  }
  return primary;
}
