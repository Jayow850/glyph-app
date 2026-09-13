import { prisma } from "@/lib/prisma";
import { updateRating, type GameOutcome } from "../../../lib/rating/elo.ts";
import type { GlyphGame, EndReason } from "../../../lib/game/server.ts";

/**
 * Finalize a finished game: persist PGN + result, then trigger the ELO
 * engine for rated games. Idempotent — a game row can only finalize once.
 */
export async function finalizeRatedGame(g: GlyphGame, fin: { result: string; reason: EndReason }) {
  const { id, whiteId, blackId, rated } = g.cfg;
  const existing = await prisma.game.findUnique({ where: { id } });
  if (existing?.status === "FINISHED") return; // idempotent

  const [white, black] = await Promise.all([
    prisma.user.findUnique({ where: { id: whiteId }, include: { profile: true } }),
    prisma.user.findUnique({ where: { id: blackId }, include: { profile: true } }),
  ]);
  const pgn = g.pgn({ White: white?.name ?? "White", Black: black?.name ?? "Black", Result: fin.result });

  await prisma.game.update({
    where: { id },
    data: {
      status: "FINISHED", result: fin.result, endReason: fin.reason, pgn,
      fen: g.snapshot().fen, movesJson: g.snapshot().sans,
      winnerId: fin.result === "1-0" ? whiteId : fin.result === "0-1" ? blackId : null,
      endedAt: new Date(),
    },
  });

  if (rated) {
    // score from white's perspective; the ELO engine handles K-factors + provisional
    const score = fin.result === "1-0" ? 1 : fin.result === "0-1" ? 0 : 0.5;
    const [rw, rb] = await Promise.all([
      prisma.rating.findFirst({ where: { userId: whiteId, clubId: null, timeControl: "RAPID" } }),
      prisma.rating.findFirst({ where: { userId: blackId, clubId: null, timeControl: "RAPID" } }),
    ]);
    if (rw && rb) {
      const stateOf = (r: typeof rw) => ({ current: r.current, peak: r.peak, gamesPlayed: r.gamesPlayed, provisional: r.provisional, kFactor: r.kFactor });
      const resW = updateRating(stateOf(rw), rb.current, score as GameOutcome);
      const resB = updateRating(stateOf(rb), rw.current, (1 - score) as GameOutcome);
      await prisma.$transaction([
        prisma.rating.update({ where: { id: rw.id }, data: { current: resW.after, peak: resW.newPeak, gamesPlayed: { increment: 1 }, provisional: resW.stillProvisional } }),
        prisma.rating.update({ where: { id: rb.id }, data: { current: resB.after, peak: resB.newPeak, gamesPlayed: { increment: 1 }, provisional: resB.stillProvisional } }),
        prisma.ratingHistory.create({ data: { ratingId: rw.id, before: resW.before, after: resW.after, delta: resW.delta, gameId: id } }),
        prisma.ratingHistory.create({ data: { ratingId: rb.id, before: resB.before, after: resB.after, delta: resB.delta, gameId: id } }),
      ]);
    }
    // rivalry head-to-head update
    const [aId, bId] = [whiteId, blackId].sort();
    const aWon = (fin.result === "1-0" && aId === whiteId) || (fin.result === "0-1" && aId === blackId);
    await prisma.rivalry.upsert({
      where: { aId_bId: { aId, bId } },
      update: fin.result === "1/2-1/2" ? { draws: { increment: 1 }, lastPlayedAt: new Date() }
        : aWon ? { aWins: { increment: 1 }, lastPlayedAt: new Date() } : { bWins: { increment: 1 }, lastPlayedAt: new Date() },
      create: { aId, bId, aWins: aWon && fin.result !== "1/2-1/2" ? 1 : 0, bWins: !aWon && fin.result !== "1/2-1/2" ? 1 : 0, draws: fin.result === "1/2-1/2" ? 1 : 0, lastPlayedAt: new Date() },
    });
  }
}
