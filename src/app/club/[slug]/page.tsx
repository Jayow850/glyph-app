import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

// Public SEO club page: /club/[slug]
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const club = await prisma.club.findUnique({ where: { slug } });
  if (!club) return {};
  return {
    title: club.name,
    description: club.description ?? `${club.name} on Glyph — tournaments, ratings, and community.`,
    openGraph: { title: club.name, images: club.bannerUrl ? [club.bannerUrl] : [] },
  };
}

export default async function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await prisma.club.findUnique({
    where: { slug },
    include: {
      _count: { select: { memberships: { where: { active: true } } } },
      tournaments: { orderBy: { createdAt: "desc" }, take: 5 },
      events: { where: { startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 3 },
      posts: { where: { pinned: true }, take: 1, include: { author: { include: { profile: true } } } },
    },
  });
  if (!club || !club.isPublic) notFound();

  return (
    <article className="space-y-6">
      <header className="card overflow-hidden">
        {club.bannerUrl && <div className="h-28 bg-felt-deep" style={{ backgroundImage: `url(${club.bannerUrl})`, backgroundSize: "cover" }} />}
        <div className="p-4">
          <h1 className="font-display text-2xl">{club.name}</h1>
          <p className="text-sm text-ivory-dim">
            {club.city ? `${club.city}, ` : ""}{club.country ?? ""} · {club._count.memberships} members
          </p>
          {club.description && <p className="mt-2 text-sm">{club.description}</p>}
          <a href={`/api/clubs/${slug}/join`} className="mt-3 inline-block rounded bg-felt px-4 py-2 text-sm font-medium text-ivory hover:bg-felt-bright">
            Join club
          </a>
        </div>
      </header>

      <section>
        <h2 className="mb-2 font-display text-lg">Tournaments</h2>
        <ul className="space-y-2">
          {club.tournaments.map((t) => (
            <li key={t.id} className="card flex items-center justify-between px-4 py-3">
              <div>
                <p>{t.name}</p>
                <p className="font-score text-xs text-ivory-dim">
                  {t.format} · {t.timeControlDetail ?? t.timeControl} · Rd {t.currentRound}/{t.totalRounds}
                </p>
              </div>
              <span className={`font-score text-xs ${t.status === "IN_PROGRESS" ? "text-felt-bright" : "text-ivory-dim"}`}>
                {t.status.replace("_", " ").toLowerCase()}
              </span>
            </li>
          ))}
          {club.tournaments.length === 0 && (
            <li className="card px-4 py-6 text-center text-sm text-ivory-dim">
              No tournaments yet. Organizers can create the first one.
            </li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-display text-lg">Upcoming events</h2>
        <ul className="space-y-2">
          {club.events.map((e) => (
            <li key={e.id} className="card px-4 py-3">
              <p>{e.title}</p>
              <p className="font-score text-xs text-ivory-dim">
                {e.type.toLowerCase()} · {new Date(e.startsAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
