import { prisma } from "@/lib/prisma";
import { standings } from "@/lib/services/tournament";
import { PairingsTable } from "@/components/PairingsTable";
import { StandingsTable } from "@/components/StandingsTable";
import { notFound } from "next/navigation";

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: {
      rounds: {
        orderBy: { number: "desc" },
        take: 1,
        include: {
          matches: {
            orderBy: { boardNumber: "asc" },
            include: {
              white: { include: { profile: true } },
              black: { include: { profile: true } },
            },
          },
        },
      },
      entries: true,
    },
  });
  if (!t) notFound();

  const seeds = new Map(t.entries.map((e) => [e.userId, e.seedRating]));
  const round = t.rounds[0];
  const pairingRows = round?.matches.map((m) => ({
    boardNumber: m.boardNumber,
    white: { name: m.white?.profile?.fullName ?? "—", rating: seeds.get(m.whiteId ?? "") ?? 0 },
    black: m.black ? { name: m.black.profile?.fullName ?? "—", rating: seeds.get(m.blackId!) ?? 0 } : null,
    result: m.result,
  })) ?? [];

  const table = await standings(id);
  const standingRows = table.map((s) => ({
    rank: s.rank,
    name: s.player?.fullName ?? s.userId,
    score: s.score,
    buchholz: s.tiebreaks.BUCHHOLZ,
    sb: s.tiebreaks.SONNEBORN_BERGER,
  }));

  return (
    <article className="space-y-6">
      <header>
        <h1 className="font-display text-2xl">{t.name}</h1>
        <p className="font-score text-xs text-ivory-dim">
          {t.format} · {t.timeControlDetail ?? t.timeControl} · Round {t.currentRound}/{t.totalRounds} · {t.status.replace("_", " ").toLowerCase()}
        </p>
        <a href={`/api/tournaments/${id}/wallchart`} className="mt-2 inline-block rounded border border-board-line px-3 py-1.5 font-score text-xs text-ivory-dim hover:text-ivory">
          Print wallchart (PDF)
        </a>
      </header>
      {round && <PairingsTable rows={pairingRows} roundNumber={round.number} />}
      <div>
        <h2 className="mb-2 font-display text-lg">Standings</h2>
        <StandingsTable rows={standingRows} />
      </div>
    </article>
  );
}
