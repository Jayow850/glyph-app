import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Tournaments" };

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:       { label: "Draft",        color: "var(--text-muted)", bg: "rgba(138,138,147,0.12)" },
  REGISTRATION:{ label: "Entry open",   color: "var(--gold)", bg: "rgba(212,175,55,0.14)" },
  CHECK_IN:    { label: "Check-in",     color: "var(--gold)", bg: "rgba(212,175,55,0.14)" },
  IN_PROGRESS: { label: "Live",         color: "var(--success)", bg: "rgba(127,176,105,0.14)" },
  PAUSED:      { label: "Paused",       color: "var(--draw)", bg: "rgba(155,164,176,0.14)" },
  COMPLETED:   { label: "Complete",     color: "var(--text-muted)", bg: "rgba(138,138,147,0.12)" },
  CANCELLED:   { label: "Cancelled",    color: "var(--danger)", bg: "rgba(176,87,90,0.14)" },
};

function StatusChip({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.DRAFT;
  return (
    <span
      style={{
        fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase",
        fontWeight: 600, color: s.color, background: s.bg,
        borderRadius: 6, padding: "4px 8px", flexShrink: 0,
      }}
    >
      {s.label}
    </span>
  );
}

export default async function TournamentsPage() {
  const tournaments = await prisma.tournament.findMany({
    include: {
      club: { select: { name: true } },
      _count: { select: { entries: true } },
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 className="font-display" style={{ fontSize: 28 }}>Tournaments</h1>
        <p className="text-ivory-meta" style={{ fontSize: 15 }}>
          Swiss pairings, live standings, and a wallchart you can print.
        </p>
      </div>

      {tournaments.length === 0 ? (
        <div className="card">
          <p className="text-ivory-meta" style={{ fontSize: 15 }}>
            No tournaments yet. Clubs create them from their own page.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {tournaments.map((t) => (
            <Link key={t.id} href={`/tournaments/${t.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <article className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <h2 className="font-display" style={{ fontSize: 19, flex: 1, minWidth: 0 }}>{t.name}</h2>
                  <StatusChip status={t.status} />
                </div>

                <p className="text-ivory-meta" style={{ fontSize: 14 }}>{t.club.name}</p>

                <div className="digits" style={{ display: "flex", gap: 14, fontSize: 13, color: "var(--text-muted)", flexWrap: "wrap" }}>
                  <span>{t.format.replace("_", " ").toLowerCase()}</span>
                  <span>{t.timeControlDetail ?? t.timeControl.toLowerCase()}</span>
                  <span>round {t.currentRound}/{t.totalRounds}</span>
                  <span>{t._count.entries} players</span>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
