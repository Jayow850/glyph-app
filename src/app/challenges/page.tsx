import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChallengeActions } from "@/components/ChallengeActions";

export const metadata = { title: "Challenges" };

export default async function ChallengesPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;

  if (!userId) {
    return (
      <div style={{ paddingTop: 48, textAlign: "center" }}>
        <p className="font-display" style={{ fontSize: 22 }}>Sign in to challenge players.</p>
        <Link href="/api/auth/signin" className="bg-gold text-night"
          style={{ display: "inline-block", marginTop: 16, borderRadius: 12, padding: "10px 20px", fontWeight: 600 }}>
          Sign in
        </Link>
      </div>
    );
  }

  const [incoming, outgoing, players, activeGames] = await Promise.all([
    prisma.challenge.findMany({
      where: { toId: userId, status: "pending" },
      include: { from: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.challenge.findMany({
      where: { fromId: userId, status: "pending" },
      include: { to: { include: { profile: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { id: { not: userId } },
      include: { profile: true, ratings: { where: { clubId: null, timeControl: "RAPID" } } },
      take: 20,
    }),
    prisma.liveGame.findMany({
      where: { status: "ACTIVE", OR: [{ whiteId: userId }, { blackId: userId }] },
      include: { white: { include: { profile: true } }, black: { include: { profile: true } } },
    }),
  ]);

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 className="font-display" style={{ fontSize: 24 }}>Challenges</h1>

      {activeGames.length > 0 && (
        <div className="card">
          <p className="section-label" style={{ marginBottom: 12 }}>Your games</p>
          {activeGames.map((g) => {
            const opp = g.whiteId === userId ? g.black : g.white;
            const youAre = g.whiteId === userId ? "White" : "Black";
            return (
              <Link key={g.id} href={`/game/${g.id}`}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", textDecoration: "none" }}>
                <span style={{ fontSize: 20 }}>♟</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15 }}>vs {opp.profile?.fullName ?? "player"}</p>
                  <p className="text-ivory-meta digits" style={{ fontSize: 12 }}>
                    You are {youAre} · {g.sans.length} moves played
                  </p>
                </div>
                <span className="text-gold" style={{ fontSize: 13, fontWeight: 600 }}>Open →</span>
              </Link>
            );
          })}
        </div>
      )}

      {incoming.length > 0 && (
        <div className="card">
          <p className="section-label" style={{ marginBottom: 12 }}>Waiting for you</p>
          {incoming.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0" }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15 }}>{c.from.profile?.fullName ?? "player"} challenged you</p>
                <p className="text-ivory-meta digits" style={{ fontSize: 12 }}>{c.timeControl} · {c.rated ? "rated" : "casual"}</p>
              </div>
              <ChallengeActions challengeId={c.id} />
            </div>
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="card">
          <p className="section-label" style={{ marginBottom: 12 }}>Sent</p>
          {outgoing.map((c) => (
            <p key={c.id} className="text-ivory-meta" style={{ fontSize: 14, padding: "6px 0" }}>
              Waiting on {c.to.profile?.fullName ?? "player"} · {c.timeControl}
            </p>
          ))}
        </div>
      )}

      <div className="card">
        <p className="section-label" style={{ marginBottom: 12 }}>Players</p>
        {players.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
            borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center",
              background: "#1C1C21", border: "1px solid rgba(212,175,55,0.08)", fontSize: 18, flexShrink: 0 }}>♟</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15 }}>{p.profile?.fullName ?? "player"}</p>
              <p className="text-ivory-meta digits" style={{ fontSize: 12 }}>
                @{p.profile?.handle}{p.ratings[0] ? ` · ${p.ratings[0].current}` : ""}
              </p>
            </div>
            <ChallengeActions handle={p.profile?.handle ?? ""} />
          </div>
        ))}
      </div>
    </div>
  );
}