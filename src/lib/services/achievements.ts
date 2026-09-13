import { prisma } from "../prisma";
import { notify } from "./notifications";

const PLATFORM_ACHIEVEMENTS = [
  { code: "TOURNAMENT_CHAMPION", name: "Tournament Champion", description: "Won a tournament", icon: "🏆" },
  { code: "RUNNER_UP", name: "Runner-up", description: "Finished 2nd in a tournament", icon: "🥈" },
  { code: "PODIUM", name: "Podium Finish", description: "Finished top 3", icon: "🥉" },
  { code: "UNDEFEATED", name: "Undefeated", description: "Completed a tournament without a loss", icon: "🛡️" },
  { code: "GIANT_SLAYER", name: "Giant Slayer", description: "Beat an opponent rated 200+ above you", icon: "⚔️" },
  { code: "MOST_IMPROVED", name: "Most Improved", description: "Biggest rating gain of the season", icon: "📈" },
  { code: "FAIR_PLAY", name: "Fair Play", description: "Awarded by arbiters for sportsmanship", icon: "🤝" },
  { code: "FIRST_TOURNAMENT", name: "First Steps", description: "Played your first tournament", icon: "♟️" },
  { code: "VETERAN_50", name: "Veteran", description: "50 rated games played", icon: "🎖️" },
];

export async function seedAchievements() {
  for (const a of PLATFORM_ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { clubId_code: { clubId: null as never, code: a.code } },
      create: { code: a.code, name: a.name, description: a.description, iconUrl: a.icon },
      update: {},
    }).catch(async () => {
      const exists = await prisma.achievement.findFirst({ where: { clubId: null, code: a.code } });
      if (!exists) await prisma.achievement.create({ data: { code: a.code, name: a.name, description: a.description, iconUrl: a.icon } });
    });
  }
}

export async function award(userId: string, code: string, tournamentId?: string) {
  const achievement = await prisma.achievement.findFirst({ where: { code, clubId: null } });
  if (!achievement) return;
  const dup = await prisma.userAchievement.findFirst({
    where: { userId, achievementId: achievement.id, tournamentId: tournamentId ?? undefined },
  });
  if (dup) return;
  await prisma.userAchievement.create({ data: { userId, achievementId: achievement.id, tournamentId } });
  await notify({ userIds: [userId], type: "ACHIEVEMENT", title: `Achievement unlocked: ${achievement.name} ${achievement.iconUrl ?? ""}` });
}

export async function awardTournamentAchievements(tournamentId: string, table: { userId: string; rank: number }[]) {
  for (const row of table) {
    if (row.rank === 1) await award(row.userId, "TOURNAMENT_CHAMPION", tournamentId);
    if (row.rank === 2) await award(row.userId, "RUNNER_UP", tournamentId);
    if (row.rank === 3) await award(row.userId, "PODIUM", tournamentId);
  }
  // Undefeated check
  const matches = await prisma.match.findMany({ where: { round: { tournamentId } } });
  for (const row of table) {
    const lost = matches.some((m) =>
      (m.whiteId === row.userId && (m.result === "BLACK_WIN" || m.result === "WHITE_FORFEIT")) ||
      (m.blackId === row.userId && (m.result === "WHITE_WIN" || m.result === "BLACK_FORFEIT"))
    );
    if (!lost) await award(row.userId, "UNDEFEATED", tournamentId);
  }
}
