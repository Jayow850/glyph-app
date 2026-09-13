import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Clubs" };

export default async function ClubsPage() {
  const clubs = await prisma.club.findMany({
    where: { isPublic: true },
    include: { _count: { select: { memberships: { where: { active: true } } } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 className="font-display" style={{ fontSize: 24 }}>Clubs</h1>

      {clubs.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <p className="font-display" style={{ fontSize: 18 }}>No clubs yet.</p>
          <p className="text-ivory-meta" style={{ fontSize: 14, marginTop: 4 }}>
            Clubs are where tournaments and match nights live.
          </p>
        </div>
      ) : (
        clubs.map((club) => (
          <Link key={club.id} href={`/club/${club.slug}`} className="card"
            style={{ display: "flex", alignItems: "center", gap: 16, textDecoration: "none" }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, display: "grid", placeItems: "center",
              background: "#1C1C21", border: "1px solid rgba(212,175,55,0.15)", fontSize: 26, flexShrink: 0 }}>♜</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="font-display" style={{ fontSize: 18 }}>{club.name}</p>
              <p className="text-ivory-meta digits" style={{ fontSize: 13 }}>
                {club._count.memberships} {club._count.memberships === 1 ? "member" : "members"}
              </p>
              {club.description && (
                <p className="text-ivory-meta" style={{ fontSize: 13, marginTop: 4,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {club.description}
                </p>
              )}
            </div>
            <span className="text-ivory-meta" style={{ fontSize: 18 }}>›</span>
          </Link>
        ))
      )}
    </div>
  );
}