import { prisma } from "../prisma";
import { cached } from "../redis";
import type { TimeControl } from "@prisma/client";

/** Club leaderboard — Redis-cached 60s, invalidated on rating change. */
export async function clubLeaderboard(clubId: string, timeControl: TimeControl, limit = 50) {
  return cached(`leaderboard:${clubId}:${timeControl}`, 60, async () => {
    return prisma.rating.findMany({
      where: { clubId, timeControl },
      orderBy: { current: "desc" },
      take: limit,
      include: { user: { include: { profile: true } } },
    });
  });
}

/** Global rankings across the platform (Pro feature). */
export async function globalLeaderboard(timeControl: TimeControl, country?: string, limit = 100) {
  return cached(`global:${timeControl}:${country ?? "all"}`, 300, async () => {
    return prisma.rating.findMany({
      where: {
        clubId: null,
        timeControl,
        provisional: false,
        user: country ? { profile: { country } } : undefined,
      },
      orderBy: { current: "desc" },
      take: limit,
      include: { user: { include: { profile: true } } },
    });
  });
}

/** Player stat block for profile pages. */
export async function playerStats(userId: string) {
  const matches = await prisma.match.findMany({
    where: {
      OR: [{ whiteId: userId }, { blackId: userId }],
      resultStatus: { in: ["CONFIRMED", "ARBITER_RULED"] },
      blackId: { not: null },
    },
  });
  let wins = 0, losses = 0, draws = 0, streak = 0, bestStreak = 0;
  for (const m of matches) {
    const isWhite = m.whiteId === userId;
    const won = (isWhite && (m.result === "WHITE_WIN" || m.result === "BLACK_FORFEIT")) ||
                (!isWhite && (m.result === "BLACK_WIN" || m.result === "WHITE_FORFEIT"));
    const drew = m.result === "DRAW";
    if (won) { wins++; streak++; bestStreak = Math.max(bestStreak, streak); }
    else if (drew) { draws++; }
    else { losses++; streak = 0; }
  }
  const total = wins + losses + draws;
  const swings = await prisma.ratingHistory.aggregate({
    where: { rating: { userId } },
    _max: { delta: true }, _min: { delta: true },
  });
  return {
    wins, losses, draws, total,
    winRate: total ? Math.round((wins / total) * 100) : 0,
    longestWinStreak: bestStreak,
    biggestGain: swings._max.delta ?? 0,
    biggestLoss: swings._min.delta ?? 0,
  };
}
