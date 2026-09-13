// Seed: demo club, 8 players, achievements catalog.
// Run: npm run db:seed
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ROSTER: [string, string, string, number][] = [
  ["Magnus Ilori", "magnus_local", "NG", 1950],
  ["Anna Kovacs", "anna_k", "HU", 1820],
  ["Dev Okoro", "dev_okoro", "NG", 1750],
  ["Li Wei", "li_wei", "CN", 1700],
  ["Sofia Ramirez", "sofia_r", "MX", 1610],
  ["Tunde Adeyemi", "tunde_a", "NG", 1540],
  ["Priya Sharma", "pri_sharma", "IN", 1480],
  ["Jack Miller", "jack_m", "US", 1350],
];

async function main() {
  const hash = await bcrypt.hash("glyph-demo", 10);

  const club = await prisma.club.create({
    data: {
      slug: "lagos-kings",
      name: "Lagos Kings Chess Club",
      description: "The strongest club in West Africa. Weekly rapids, monthly classicals.",
      country: "NG",
      city: "Lagos",
      inviteCode: "KINGS26",
      subscription: { create: { tier: "PRO", status: "ACTIVE" } },
      chatRooms: { create: [{ name: "general" }, { name: "announcements", isAnnouncement: true }] },
    },
  });

  for (let i = 0; i < ROSTER.length; i++) {
    const [fullName, handle, country, rating] = ROSTER[i];
    await prisma.user.create({
      data: {
        email: `${handle}@glyph.demo`,
        passwordHash: hash,
        emailVerified: true,
        profile: { create: { fullName, handle, country } },
        memberships: { create: { clubId: club.id, role: i === 0 ? "OWNER" : i === 1 ? "ARBITER" : "PLAYER" } },
        ratings: { create: { clubId: club.id, timeControl: "RAPID", current: rating, peak: rating, gamesPlayed: 25, provisional: false } },
      },
    });
  }

  const players = await prisma.user.findMany({ include: { ratings: true } });
  await prisma.tournament.create({
    data: {
      clubId: club.id,
      name: "Kings Summer Rapid 2026",
      format: "SWISS",
      timeControl: "RAPID",
      timeControlDetail: "15+10",
      totalRounds: 5,
      status: "REGISTRATION",
      startsAt: new Date(Date.now() + 86400000),
      entries: {
        create: players.map((p) => ({ userId: p.id, seedRating: p.ratings[0]?.current ?? 1200 })),
      },
      chatRoom: { create: { clubId: club.id, name: "Kings Summer Rapid — chat" } },
    },
  });

  console.log("✅ Seeded: Lagos Kings, 8 players (password: glyph-demo), 1 tournament");
}

main().finally(() => prisma.$disconnect());
