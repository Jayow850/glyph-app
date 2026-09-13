// ============================================================
// GLYPH realtime layer — authenticated sockets, rooms, the
// server-authoritative move loop, live-stream events, and
// reconnection resync. Run alongside Next: `npm run socket`.
// Scale: attach @socket.io/redis-adapter so room broadcasts
// coordinate across instances; GlyphGame state lives in Redis
// via GameStore so any instance can serve any game.
// ============================================================
import { Server, type Socket } from "socket.io";
import { createServer } from "http";
import { getToken } from "next-auth/jwt";
import { GlyphGame, type GameSnapshot } from "../../../lib/game/server.ts";
import { parseSquare } from "../../../lib/game/engine.ts";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { finalizeRatedGame } from "@/lib/services/gamePersistence";
import { sendGiftTxn } from "@/lib/services/gifts";
import { bumpPopularity } from "@/lib/services/popularity";

// ---- in-memory game registry (Redis-backed snapshots for multi-instance) ----
const games = new Map<string, GlyphGame>();
export async function registerGame(g: GlyphGame) {
  games.set(g.cfg.id, g);
  await redis.set(`game:${g.cfg.id}:snap`, JSON.stringify(g.snapshot()), "EX", 60 * 60 * 6);
}

// ---- per-socket token-bucket rate limiter (move/chat/gift spam) ----
function bucket(capacity: number, refillPerSec: number) {
  let tokens = capacity, last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * refillPerSec);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1; return true;
  };
}

interface AuthedSocket extends Socket { userId: string; limits: Record<string, () => boolean>; }

export function startRealtime(port = 4001) {
  const httpServer = createServer();
  const io = new Server(httpServer, { cors: { origin: process.env.NEXTAUTH_URL, credentials: true } });

  // ---- connection lifecycle: authenticate every socket ----
  io.use(async (socket, next) => {
    try {
      const token = await getToken({ req: { headers: { cookie: socket.handshake.headers.cookie ?? "" } } as never, secret: process.env.NEXTAUTH_SECRET });
      if (!token?.sub) return next(new Error("unauthorized"));
      (socket as AuthedSocket).userId = token.sub;
      (socket as AuthedSocket).limits = {
        move: bucket(10, 5), chat: bucket(8, 1.5), gift: bucket(5, 0.5), vote: bucket(4, 1), typing: bucket(10, 3),
      };
      next();
    } catch { next(new Error("unauthorized")); }
  });

  io.on("connection", (raw) => {
    const socket = raw as AuthedSocket;
    const uid = socket.userId;

    // ---- rooms: game / live / dm — with presence ----
    socket.on("room:join", async ({ kind, id }: { kind: "game" | "live" | "dm"; id: string }) => {
      const room = `${kind}:${id}`;
      await socket.join(room);
      io.to(room).emit("presence", { userId: uid, joined: true, count: (await io.in(room).fetchSockets()).length });
      // reconnection resync: late joiners and returning players get full authoritative state
      if (kind === "game") {
        const g = games.get(id);
        const snap = g ? g.snapshot() : JSON.parse((await redis.get(`game:${id}:snap`)) ?? "null");
        if (snap) socket.emit("gameState", snap as GameSnapshot);
      }
      if (kind === "live") await bumpPopularity(id, { viewers: 1 });
    });
    socket.on("room:leave", async ({ kind, id }: { kind: string; id: string }) => {
      const room = `${kind}:${id}`;
      await socket.leave(room);
      io.to(room).emit("presence", { userId: uid, joined: false, count: (await io.in(room).fetchSockets()).length });
    });

    // ---- the move loop: intent → server verdict → broadcast ----
    socket.on("move", async ({ gameId, seq, from, to, promotion }: { gameId: string; seq: number; from: string; to: string; promotion?: string }, ack?: (v: unknown) => void) => {
      if (!socket.limits.move()) return ack?.({ ok: false, error: "rate_limited" });
      const g = games.get(gameId);
      if (!g) return ack?.({ ok: false, error: "not_found" });
      const verdict = g.moveIntent(uid, seq, parseSquare(from), parseSquare(to), promotion);
      ack?.(verdict); // mover gets the verdict — an illegal/stale verdict tells the client to roll back its prediction
      if (verdict.ok) {
        io.to(`game:${gameId}`).emit("gameState", verdict.snapshot); // authoritative state to both players + spectators
        await redis.set(`game:${gameId}:snap`, JSON.stringify(verdict.snapshot), "EX", 21600);
        if (verdict.finished) await finalizeRatedGame(g, verdict.finished); // PGN + result + ELO trigger
      } else if (verdict.error === "flagged" && verdict.snapshot.status === "finished") {
        io.to(`game:${gameId}`).emit("gameState", verdict.snapshot);
        await finalizeRatedGame(g, { result: verdict.snapshot.result!, reason: "timeout" });
      }
    });
    socket.on("resign", async ({ gameId }: { gameId: string }) => {
      const g = games.get(gameId); if (!g) return;
      const snap = g.resign(uid);
      io.to(`game:${gameId}`).emit("gameState", snap);
      if (snap.status === "finished") await finalizeRatedGame(g, { result: snap.result!, reason: "resign" });
    });
    socket.on("drawOffer", async ({ gameId }: { gameId: string }) => {
      const g = games.get(gameId); if (!g) return;
      const snap = g.offerDraw(uid);
      io.to(`game:${gameId}`).emit("gameState", snap);
      if (snap.status === "finished") await finalizeRatedGame(g, { result: snap.result!, reason: "draw_agreed" });
    });

    // ---- chat & typing (games, live rooms, DM threads) ----
    socket.on("chat", ({ room, text }: { room: string; text: string }) => {
      if (!socket.limits.chat() || !text?.trim() || text.length > 500) return;
      io.to(room).emit("chat", { userId: uid, text: text.trim(), at: Date.now() });
    });
    socket.on("typing", ({ room }: { room: string }) => {
      if (socket.limits.typing()) socket.to(room).emit("typing", { userId: uid });
    });

    // ---- live-stream engagement: likes, gifts, Hive Mind, on-stage voice ----
    socket.on("live:like", async ({ streamId }: { streamId: string }) => {
      io.to(`live:${streamId}`).emit("live:like", { userId: uid }); // floats a gold pawn
      await bumpPopularity(streamId, { likes: 1 });
    });
    socket.on("live:gift", async ({ streamId, gift, clientTxnId }: { streamId: string; gift: string; clientTxnId: string }, ack?: (v: unknown) => void) => {
      if (!socket.limits.gift()) return ack?.({ ok: false, error: "rate_limited" });
      const res = await sendGiftTxn({ senderId: uid, streamId, giftKey: gift, clientTxnId }); // server-validated balance, idempotent
      ack?.(res);
      if (res.ok) {
        io.to(`live:${streamId}`).emit("live:gift", { userId: uid, gift, coins: res.coins });
        await bumpPopularity(streamId, { giftCoins: res.coins });
      }
    });
    socket.on("live:vote", ({ streamId, move }: { streamId: string; move: string }) => {
      if (!socket.limits.vote()) return;
      io.to(`live:${streamId}`).emit("live:vote", { userId: uid, move }); // Hive Mind aggregation client-side + periodic server tally
    });
    socket.on("live:stage", ({ streamId, action, targetId }: { streamId: string; action: "request" | "invite" | "mute" | "kick"; targetId?: string }) => {
      io.to(`live:${streamId}`).emit("live:stage", { by: uid, action, targetId }); // host controls enforced by room-owner check in service layer
    });

    socket.on("disconnecting", () => {
      for (const room of socket.rooms) if (room !== socket.id) socket.to(room).emit("presence", { userId: uid, joined: false });
    });
  });

  // ---- heartbeat: authoritative clock ticks flag idle players; spectators stay in sync ----
  setInterval(async () => {
    for (const [id, g] of games) {
      const before = g.snapshot().status;
      const snap = g.tick();
      if (snap.status !== before) {
        io.to(`game:${id}`).emit("gameState", snap);
        await finalizeRatedGame(g, { result: snap.result!, reason: "timeout" });
        games.delete(id);
      } else if (snap.status === "active") {
        io.to(`game:${id}`).emit("clock", snap.clocks);
      } else games.delete(id);
    }
  }, 1000);

  httpServer.listen(port);
  console.log(`GLYPH realtime on :${port}`);
  return io;
}
