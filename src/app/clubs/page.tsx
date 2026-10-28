import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ListRow, ListGroup } from "@/components/ui/ListRow";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clubs" };

/** The club crest: the rook, drawn, not the ♜ character. */
function Crest({ mine }: { mine?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 44, height: 44, borderRadius: "var(--r-md)", flexShrink: 0,
        display: "grid", placeItems: "center",
        background: mine ? "var(--gold-wash)" : "var(--surface-2)",
        color: mine ? "var(--gold)" : "var(--text-muted)",
        border: `1px solid ${mine ? "var(--border-gold)" : "var(--border)"}`,
      }}
    >
      <Icon name="castle" size={22} />
    </span>
  );
}

export default async function ClubsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;

  const [clubs, mine] = await Promise.all([
    prisma.club.findMany({
      where: { isPublic: true },
      include: { _count: { select: { memberships: { where: { active: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    userId
      ? prisma.membership.findMany({ where: { userId, active: true }, select: { clubId: true } })
      : Promise.resolve([]),
  ]);

  const mineIds = new Set(mine.map((m) => m.clubId));

  // Members online right now, per club. One grouped read rather than a
  // query per club — this list is the only place that shows a club is
  // a room with people in it rather than a row in a table.
  const since = new Date(Date.now() - 3 * 60 * 1000);
  const liveMembers = await prisma.membership.findMany({
    where: {
      active: true,
      clubId: { in: clubs.map((c) => c.id) },
      user: { profile: { lastSeenAt: { gte: since } } },
    },
    select: { clubId: true },
  });
  const online = liveMembers.reduce<Record<string, number>>((acc, m) => {
    acc[m.clubId] = (acc[m.clubId] ?? 0) + 1;
    return acc;
  }, {});

  const yours = clubs.filter((c) => mineIds.has(c.id));
  const others = clubs.filter((c) => !mineIds.has(c.id));

  const row = (club: (typeof clubs)[number], isMine: boolean) => (
    <ListRow
      key={club.id}
      href={`/club/${club.slug}`}
      name={club.name}
      icon={<Crest mine={isMine} />}
      meta={[
        <span key="m" className="digits">
          {club._count.memberships} {club._count.memberships === 1 ? "member" : "members"}
        </span>,
        online[club.id] ? <span key="o" style={{ color: "var(--success)" }}>{online[club.id]} online</span> : null,
        club.city ? `${club.city}${club.country ? `, ${club.country}` : ""}` : null,
      ]}
      action={<Icon name="chevronRight" size={18} />}
    />
  );

  return (
    <div
      className="page-bottom"
      style={{ paddingTop: "var(--s5)", display: "flex", flexDirection: "column", gap: "var(--s6)" }}
    >
      <h1 className="font-display t-display">Clubs</h1>

      {clubs.length === 0 ? (
        <div
          style={{
            textAlign: "center", padding: "var(--s10) var(--s4)",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
          }}
        >
          <span style={{ color: "var(--text-dim)", display: "inline-block", marginBottom: "var(--s2)" }}>
            <Icon name="castle" size={30} />
          </span>
          <p style={{ fontWeight: 600 }}>No clubs yet.</p>
          <p className="t-secondary" style={{ marginTop: 2 }}>
            A club is where tournaments and match nights live.
          </p>
        </div>
      ) : (
        <>
          {yours.length > 0 && (
            <section>
              <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>Your clubs</h2>
              <ListGroup>{yours.map((c) => row(c, true))}</ListGroup>
            </section>
          )}

          {others.length > 0 && (
            <section>
              <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>
                {yours.length > 0 ? "Other clubs" : "All clubs"}
              </h2>
              <ListGroup>{others.map((c) => row(c, false))}</ListGroup>
            </section>
          )}
        </>
      )}
    </div>
  );
}
