import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/ui/Avatar";
import { TrophyCabinet } from "@/components/trophy/TrophyCabinet";
import { TrophyForm } from "@/components/trophy/TrophyForm";
import { Panel, PanelSkeleton } from "@/components/club/Panel";
import { trophyCabinet } from "@/lib/services/trophies";
import { clubContext } from "@/lib/services/clubContext";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const club = await prisma.club.findUnique({ where: { slug }, select: { name: true } });
  return { title: club ? `${club.name} — honours` : "Honours" };
}

/**
 * HONOURS — what the club has to be proud of.
 *
 * The cabinet, and the years behind it. Nothing on this tab changes
 * more than a few times a season, which is exactly why it does not
 * belong in the middle of a page a member checks daily.
 */
export default async function ClubHonoursPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;

  const ctx = await clubContext(slug, userId);
  if (!ctx) notFound();
  const { club, isMember, canAward } = ctx;
  if (!club.isPublic && !isMember) notFound();

  return (
    <>
      <Suspense fallback={<PanelSkeleton rows={3} />}>
        <Cabinet slug={slug} clubId={club.id} canAward={canAward} />
      </Suspense>

      <Suspense fallback={<PanelSkeleton rows={2} />}>
        <Champions clubId={club.id} />
      </Suspense>
    </>
  );
}

/* ------------------------------------------------------------------ */

async function Cabinet({
  slug, clubId, canAward,
}: {
  slug: string; clubId: string; canAward: boolean;
}) {
  const trophies = await trophyCabinet(clubId);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
      <h2 className="section-label">Trophy cabinet</h2>
      <TrophyCabinet clubSlug={slug} trophies={trophies} canAdd={canAward} />
      {canAward && <TrophyForm clubSlug={slug} />}
    </section>
  );
}

/**
 * Club champions by year, and the seasons behind them.
 *
 * The archive a club actually keeps: a list of names and the years
 * they won. Seasons with no champion are still listed — a season that
 * ran is part of the record whether or not anybody won it outright.
 */
async function Champions({ clubId }: { clubId: string }) {
  const seasons = await prisma.season.findMany({
    where: { clubId, status: "COMPLETE" },
    select: {
      id: true, name: true, endsAt: true, closedAt: true,
      champion: { select: { profile: { select: { fullName: true, handle: true } } } },
    },
    orderBy: { startsAt: "desc" },
    take: 40,
  });

  if (seasons.length === 0) {
    return (
      <section style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
        <h2 className="section-label">Past seasons</h2>
        <Panel
          title="No seasons closed yet"
          body="When a season is closed, its champion and final table are kept here for good."
        />
      </section>
    );
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
      <h2 className="section-label">Club champions</h2>
      <ol
        style={{
          listStyle: "none", margin: 0, padding: 0,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", overflow: "hidden",
        }}
      >
        {seasons.map((s, i) => {
          const name = s.champion?.profile?.fullName ?? null;
          const handle = s.champion?.profile?.handle ?? null;
          return (
            <li
              key={s.id}
              style={{
                display: "flex", alignItems: "center", gap: "var(--s3)",
                padding: "var(--s3) var(--s4)", minHeight: 56,
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <span
                className="digits"
                style={{
                  width: 62, flexShrink: 0, fontSize: 13, color: "var(--text-dim)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {s.name}
              </span>
              {name ? (
                <>
                  <Avatar name={name} size={28} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="t-row" style={{ display: "block", overflowWrap: "break-word" }}>
                      {handle ? (
                        <Link href={`/profile/${handle}`} style={{ color: "inherit", textDecoration: "none" }}>
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                    </span>
                  </span>
                </>
              ) : (
                <span className="t-rowmeta" style={{ flex: 1 }}>No champion recorded</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
