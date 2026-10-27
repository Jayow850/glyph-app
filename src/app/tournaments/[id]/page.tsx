import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { standings } from "@/lib/services/tournament";
import { PairingsTable, type PairingRow } from "@/components/PairingsTable";
import { StandingsTable } from "@/components/StandingsTable";
import { ArbiterControls } from "@/components/ArbiterControls";

// Role hierarchy, mirrored from lib/rbac so this page can ask without throwing.
const ROLE_ORDER = ["PARENT", "PLAYER", "COACH", "ARBITER", "ORGANIZER", "ADMIN", "OWNER"];
const atLeast = (role: string | undefined, min: string) =>
  role !== undefined && ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(min);

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;

  const t = await prisma.tournament.findUnique({
    where: { id },
    include: {
      club: { select: { name: true, slug: true } },
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

  const membership = userId
    ? await prisma.membership.findUnique({
        where: { userId_clubId: { userId, clubId: t.clubId } },
      })
    : null;
  const role = membership?.active ? membership.role : undefined;
  const canRun = atLeast(role, "ORGANIZER");
  const isArbiter = atLeast(role, "ARBITER");

  const seeds = new Map(t.entries.map((e) => [e.userId, e.seedRating]));
  const round = t.rounds[0];

  const pairingRows: PairingRow[] =
    round?.matches.map((m) => ({
      matchId: m.id,
      boardNumber: m.boardNumber,
      white: { name: m.white?.profile?.fullName ?? "—", rating: seeds.get(m.whiteId ?? "") ?? 0 },
      black: m.black ? { name: m.black.profile?.fullName ?? "—", rating: seeds.get(m.blackId!) ?? 0 } : null,
      result: m.result,
      canSubmit: isArbiter || m.whiteId === userId || m.blackId === userId,
      liveGameId: m.liveGameId,
      yours: m.whiteId === userId || m.blackId === userId,
    })) ?? [];

  const pendingResults = round
    ? round.matches.filter((m) => ["PENDING", "SUBMITTED", "DISPUTED"].includes(m.resultStatus)).length
    : 0;

  const table = await standings(id);
  const standingRows = table.map((s) => ({
    rank: s.rank,
    name: s.player?.fullName ?? s.userId,
    score: s.score,
    buchholz: s.tiebreaks.BUCHHOLZ,
    sb: s.tiebreaks.SONNEBORN_BERGER,
  }));

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 className="font-display" style={{ fontSize: 26, flex: 1 }}>{t.name}</h1>
          <Link href="/tournaments" className="text-ivory-meta" style={{ fontSize: 13 }}>← All</Link>
        </div>
        <p className="text-ivory-meta" style={{ fontSize: 14 }}>{t.club.name}</p>
        <p className="digits" style={{ fontSize: 13, color: "#8A8A93", marginTop: 4 }}>
          {t.format.replace("_", " ").toLowerCase()} · {t.timeControlDetail ?? t.timeControl.toLowerCase()} ·
          {" "}round {t.currentRound}/{t.totalRounds} · {t.status.replace("_", " ").toLowerCase()}
        </p>
      </header>

      {canRun && (
        <ArbiterControls
          tournamentId={t.id}
          currentRound={t.currentRound}
          totalRounds={t.totalRounds}
          status={t.status}
          pendingResults={pendingResults}
        />
      )}

      {round ? (
        <PairingsTable rows={pairingRows} roundNumber={round.number} />
      ) : (
        <div className="card">
          <p className="text-ivory-meta" style={{ fontSize: 15 }}>
            {t.entries.length} player{t.entries.length === 1 ? "" : "s"} entered.
            {canRun ? " Pair round 1 to begin." : " Waiting for the arbiter to pair round 1."}
          </p>
        </div>
      )}

      <div>
        <h2 className="font-display" style={{ fontSize: 19, marginBottom: 8 }}>Standings</h2>
        <StandingsTable rows={standingRows} />
      </div>
    </div>
  );
}
