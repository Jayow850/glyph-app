import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ListRow, ListGroup } from "@/components/ui/ListRow";
import { ClubNightForm } from "@/components/club/ClubNightForm";
import { LadderBoard } from "@/components/ladder/LadderBoard";
import { LadderRules } from "@/components/ladder/LadderRules";
import { Panel, PanelSkeleton } from "@/components/club/Panel";
import { ladder, rulesOf } from "@/lib/services/ladder";
import { clubNightFor } from "@/lib/services/clubnight";
import { clubContext } from "@/lib/services/clubContext";
import { stripClubName } from "@/lib/text/stripClubName";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await prisma.club.findUnique({ where: { slug }, select: { name: true } });
  return { title: club ? `${club.name} — play` : "Play" };
}

/**
 * PLAY — the ladder, the tournaments, the weekly night.
 *
 * Everything a member can enter. The ladder leads because it is the
 * only one of the three you can act on at any hour of any day.
 */
export default async function ClubPlayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;

  const ctx = await clubContext(slug, userId);
  if (!ctx) notFound();
  const { club, isMember, organiser } = ctx;
  if (!club.isPublic && !isMember) notFound();

  return (
    <>
      <Suspense fallback={<PanelSkeleton rows={4} />}>
        <Ladder slug={slug} clubId={club.id} userId={userId} isMember={isMember} organiser={organiser} />
      </Suspense>

      <Suspense fallback={<PanelSkeleton rows={2} />}>
        <Tournaments slug={slug} clubId={club.id} clubName={club.name} />
      </Suspense>

      <Suspense fallback={null}>
        <ClubNight slug={slug} clubId={club.id} userId={userId} organiser={organiser} />
      </Suspense>
    </>
  );
}

/* ------------------------------------------------------------------ */

async function Ladder({
  slug, clubId, userId, isMember, organiser,
}: {
  slug: string; clubId: string; userId: string | null; isMember: boolean; organiser: boolean;
}) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: {
      ladderRange: true, ladderCooldownDays: true,
      ladderMaxPerWeek: true, ladderMaxDeclines: true,
    },
  });
  if (!club) return null;

  const rungs = await ladder(clubId);
  const rules = rulesOf(club);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
      <h2 className="section-label">Ladder</h2>
      <LadderBoard
        clubSlug={slug}
        rungs={rungs}
        rules={rules}
        meId={userId}
        isMember={isMember}
      />
      <LadderRules clubSlug={slug} rules={rules} canEdit={organiser} />
    </section>
  );
}

async function Tournaments({
  slug, clubId, clubName,
}: {
  slug: string; clubId: string; clubName: string;
}) {
  const tournaments = await prisma.tournament.findMany({
    where: { clubId },
    select: {
      id: true, name: true, format: true, status: true,
      timeControl: true, timeControlDetail: true,
      currentRound: true, totalRounds: true,
    },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  return (
    <section>
      <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>Tournaments</h2>
      {tournaments.length === 0 ? (
        <Panel
          title="No tournaments yet"
          body="A club night run as a Swiss is the usual first one — set the weekly night below and it builds itself."
        />
      ) : (
        <ListGroup>
          {tournaments.map((t) => (
            <ListRow
              key={t.id}
              size="sm"
              href={`/tournaments/${t.id}`}
              avatar={false}
              name={stripClubName(t.name, clubName)}
              meta={[
                t.format.toLowerCase(),
                t.timeControlDetail ?? t.timeControl,
                <span key="r" className="digits">Round {t.currentRound}/{t.totalRounds}</span>,
              ]}
              action={
                <span
                  className="t-caption"
                  style={{
                    fontWeight: 600,
                    color: t.status === "IN_PROGRESS" ? "var(--gold)" : "var(--text-dim)",
                  }}
                >
                  {t.status.replace("_", " ").toLowerCase()}
                </span>
              }
            />
          ))}
        </ListGroup>
      )}
    </section>
  );
}

/** The weekly night's schedule. The card itself lives on NOW. */
async function ClubNight({
  slug, clubId, userId, organiser,
}: {
  slug: string; clubId: string; userId: string | null; organiser: boolean;
}) {
  if (!organiser) return null;
  const clubNight = await clubNightFor(clubId, userId);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
      <h2 className="section-label">Club night</h2>
      <ClubNightForm
        clubSlug={slug}
        initial={
          clubNight
            ? {
                dayOfWeek: clubNight.dayOfWeek,
                startsAt: clubNight.startsAt.toISOString(),
                timeControl: clubNight.timeControl,
                rounds: clubNight.rounds,
              }
            : null
        }
      />
    </section>
  );
}
