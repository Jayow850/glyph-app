import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { playerStats } from "@/lib/services/rankings";
import { RatingDelta, RatingBadge } from "@/components/RatingDelta";
import Link from "next/link";

export default async function Dashboard() {
  const userId = await requireUser();
  const [profile, ratings, memberships, notifications, stats] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.rating.findMany({ where: { userId }, include: { history: { orderBy: { createdAt: "desc" }, take: 1 } } }),
    prisma.membership.findMany({ where: { userId, active: true }, include: { club: true } }),
    prisma.notification.findMany({ where: { userId, readAt: null }, orderBy: { createdAt: "desc" }, take: 5 }),
    playerStats(userId),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">Good evening, {profile?.fullName?.split(" ")[0] ?? "player"} ♔</h1>
      </header>

      {/* Ratings strip — scoresheet signature */}
      <section className="card grid grid-cols-3 divide-x divide-board-line">
        {ratings.slice(0, 3).map((r) => (
          <div key={r.id} className="px-4 py-3 text-center">
            <p className="font-score text-xs uppercase text-ivory-dim">{r.timeControl.toLowerCase()}</p>
            <p className="mt-1 text-xl"><RatingBadge rating={r.current} provisional={r.provisional} /></p>
            {r.history[0] && <RatingDelta delta={r.history[0].delta} />}
          </div>
        ))}
        {ratings.length === 0 && (
          <p className="col-span-3 px-4 py-6 text-center text-sm text-ivory-dim">
            Play your first rated game to earn a rating.
          </p>
        )}
      </section>

      <section className="card px-4 py-3">
        <p className="font-score text-sm text-ivory-dim">
          {stats.wins}W · {stats.draws}D · {stats.losses}L — {stats.winRate}% · streak {stats.longestWinStreak}
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg">Your clubs</h2>
        <ul className="space-y-2">
          {memberships.map((m) => (
            <li key={m.id}>
              <Link href={`/club/${m.club.slug}`} className="card flex items-center justify-between px-4 py-3 hover:border-felt">
                <span>{m.club.name}</span>
                <span className="font-score text-xs text-ivory-dim">{m.role.toLowerCase()}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {notifications.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-lg">Latest</h2>
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li key={n.id} className="card px-4 py-3 text-sm">
                {n.title}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
