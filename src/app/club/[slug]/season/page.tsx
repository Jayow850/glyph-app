import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SeasonHome } from "@/components/season/SeasonHome";
import { LeagueTable } from "@/components/season/LeagueTable";
import { GamesOwed } from "@/components/season/GamesOwed";
import { OrganiserPanel } from "@/components/season/OrganiserPanel";
import { Panel, PanelSkeleton } from "@/components/club/Panel";
import { currentSeason, seasonTable, halfAt } from "@/lib/services/season";
import { leagueTable, gamesOwed } from "@/lib/services/league";
import { clubContext } from "@/lib/services/clubContext";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await prisma.club.findUnique({ where: { slug }, select: { name: true } });
  return { title: club ? `${club.name} — season` : "Season" };
}

/**
 * SEASON — the noticeboard.
 *
 * In a real club this is paper on a wall, and it is the single page a
 * member goes to most: where am I, who is above me, what do I still
 * owe. It gets the whole tab so the table can be read without
 * scrolling past a ladder and a trophy cabinet first.
 */
export default async function ClubSeasonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;

  const ctx = await clubContext(slug, userId);
  if (!ctx) notFound();
  const { club, isMember, organiser, canAward } = ctx;
  if (!club.isPublic && !isMember) notFound();

  const season = await currentSeason(club.id);

  if (!season) {
    return organiser ? (
      <>
        <Panel
          title="No season running"
          body="A season is the spine of a club year: two halves, a league table, and a champion at the end of it."
        />
        <Suspense fallback={<PanelSkeleton rows={2} />}>
          <Organiser slug={slug} clubId={club.id} canClose={canAward} />
        </Suspense>
      </>
    ) : (
      <Panel
        title="No season running"
        body="When the club opens its season, the table and the championship race will be here."
      />
    );
  }

  return (
    <>
      <Suspense fallback={<PanelSkeleton rows={3} />}>
        <SeasonBoard clubId={club.id} seasonId={season.id} userId={userId} isMember={isMember} />
      </Suspense>

      {organiser && (
        <Suspense fallback={<PanelSkeleton rows={2} />}>
          <Organiser slug={slug} clubId={club.id} canClose={canAward} />
        </Suspense>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

async function SeasonBoard({
  clubId, seasonId, userId, isMember,
}: {
  clubId: string; seasonId: string; userId: string | null; isMember: boolean;
}) {
  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season) return null;
  const half = halfAt(season);

  const [rows, divisions, championshipRow] = await Promise.all([
    seasonTable(season.id),
    prisma.division.findMany({
      where: { seasonId: season.id, half },
      orderBy: { tier: "asc" },
    }),
    prisma.championship.findUnique({ where: { seasonId: season.id } }),
  ]);

  const tables = await Promise.all(divisions.map((d) => leagueTable(d.id)));
  const yourDivision = userId
    ? divisions.find((d, i) => tables[i].some((r) => r.userId === userId))
    : undefined;
  const owed = yourDivision && userId ? await gamesOwed(yourDivision.id, userId) : [];

  const nameOf = (id: string | null | undefined) =>
    id ? (rows.find((r) => r.userId === id)?.name ?? null) : null;

  return (
    <>
      <SeasonHome
        name={season.name}
        startsAt={season.startsAt}
        halfwayAt={season.halfwayAt}
        endsAt={season.endsAt}
        half={half}
        table={rows}
        youId={userId}
        championship={
          championshipRow
            ? {
                autumnWinnerName: nameOf(championshipRow.autumnWinnerId),
                springWinnerName: nameOf(championshipRow.springWinnerId),
                outright: championshipRow.outright,
                championName: nameOf(championshipRow.championId),
                decidedBy: championshipRow.decidedBy,
              }
            : null
        }
      />

      {/* What you owe, above the tables: it is the only part of a
          league a member has to act on. */}
      {isMember && yourDivision && owed.length > 0 && (
        <GamesOwed
          divisionName={yourDivision.name}
          fixtures={owed.map((f) => ({
            ...f,
            dueBy: f.dueBy ? f.dueBy.toISOString() : null,
            arrangedAt: f.arrangedAt ? f.arrangedAt.toISOString() : null,
          }))}
        />
      )}

      {divisions.length > 0 ? (
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
          <h2 className="section-label">{half === "AUTUMN" ? "Autumn" : "Spring"} league</h2>
          {divisions.map((d, i) => (
            <LeagueTable
              key={d.id}
              name={d.name}
              rows={tables[i]}
              youId={userId}
              promoteCount={d.promoteCount}
              relegateCount={d.relegateCount}
              showMovement={divisions.length > 1}
            />
          ))}
        </section>
      ) : (
        <Panel
          title="No divisions yet"
          body="The season is open but nobody has been placed in a division. The table appears as soon as they are."
        />
      )}
    </>
  );
}

/** The machinery: open a season, name divisions, place people, close. */
async function Organiser({
  slug, clubId, canClose,
}: {
  slug: string; clubId: string; canClose: boolean;
}) {
  const season = await currentSeason(clubId);
  const half = season ? halfAt(season) : null;

  const [divisions, members] = await Promise.all([
    season
      ? prisma.division.findMany({ where: { seasonId: season.id, half: half! }, select: { id: true } })
      : Promise.resolve([]),
    prisma.membership.findMany({
      where: { clubId, active: true },
      select: {
        userId: true,
        user: {
          select: {
            profile: { select: { fullName: true } },
            glyphRatings: { select: { category: true, rating: true } },
          },
        },
      },
    }),
  ]);

  // Everyone an officer could place in a division, strongest first.
  const allocatable = members
    .map((m) => {
      const rapid = m.user.glyphRatings.find((r) => r.category === "RAPID");
      return {
        userId: m.userId,
        name: m.user.profile?.fullName ?? "A member",
        rating: rapid ? Math.round(rapid.rating) : null,
      };
    })
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));

  return (
    <OrganiserPanel
      clubSlug={slug}
      season={
        season
          ? {
              id: season.id,
              name: season.name,
              startsAt: season.startsAt.toISOString(),
              halfwayAt: season.halfwayAt.toISOString(),
              endsAt: season.endsAt.toISOString(),
            }
          : null
      }
      half={half}
      members={allocatable}
      hasDivisions={divisions.length > 0}
      canClose={canClose}
    />
  );
}
