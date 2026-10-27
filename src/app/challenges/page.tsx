import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChallengeActions } from "@/components/ChallengeActions";
import { ChallengeBuilder } from "@/components/challenge/ChallengeBuilder";
import { displayRating } from "@/lib/services/ratings";
import { CATEGORY_ORDER, CATEGORY_LABEL, CATEGORY_ICON, parseId, label } from "@engine/game/timeControls";
import { sideToMove } from "@/lib/game-clock";

export const metadata = { title: "Challenges" };

function clockLabel(tc: string) {
  const { base, increment } = parseId(tc);
  return label(base, increment);
}

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

  const [incoming, outgoing, activeGames, ratings] = await Promise.all([
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
    prisma.liveGame.findMany({
      where: { status: "ACTIVE", OR: [{ whiteId: userId }, { blackId: userId }] },
      include: { white: { include: { profile: true } }, black: { include: { profile: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.glyphRating.findMany({ where: { userId } }),
  ]);

  const byCategory = Object.fromEntries(ratings.map((r) => [r.category, r]));

  return (
    <div style={{ paddingTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 className="font-display" style={{ fontSize: 26 }}>Challenges</h1>
        <p className="text-ivory-meta" style={{ fontSize: 15 }}>
          Pick a clock, pick a player, play. Rated games move your GLYPH rating.
        </p>
      </div>

      {/* Your ratings, one per speed */}
      <section className="card" style={{ padding: 0, overflow: "hidden" }}>
        <p className="section-label" style={{ padding: "14px 18px 10px" }}>Your rating</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {CATEGORY_ORDER.map((c, i) => {
            const row = byCategory[c];
            return (
              <div
                key={c}
                style={{
                  padding: "4px 10px 16px",
                  textAlign: "center",
                  borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <p style={{ fontSize: 14, color: "#8A8A93", lineHeight: 1.2 }}>{CATEGORY_ICON[c]}</p>
                <p className="digits" style={{ fontSize: 21, fontWeight: 600, color: row ? "#F5F1E8" : "#53535C" }}>
                  {displayRating(row)}
                </p>
                <p className="section-label">{CATEGORY_LABEL[c]}</p>
              </div>
            );
          })}
        </div>
        <p className="text-ivory-meta" style={{ fontSize: 12, padding: "0 18px 14px" }}>
          A rating marked ? is still provisional — it moves in big steps until the system knows your level.
        </p>
      </section>

      {activeGames.length > 0 && (
        <section className="card" style={{ padding: 0, overflow: "hidden" }}>
          <p className="section-label" style={{ padding: "14px 18px 6px" }}>Your games</p>
          {activeGames.map((g, i) => {
            const opp = g.whiteId === userId ? g.black : g.white;
            const youAre = g.whiteId === userId ? "w" : "b";
            const yourMove = sideToMove(g.fen) === youAre;
            return (
              <Link
                key={g.id}
                href={`/game/${g.id}`}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 18px", textDecoration: "none", color: "inherit",
                  borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <span
                  style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: yourMove ? "#D4AF37" : "#3A3A42",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15 }}>vs {opp.profile?.fullName ?? "player"}</p>
                  <p className="text-ivory-meta digits" style={{ fontSize: 12 }}>
                    {clockLabel(g.timeControl)} · {g.rated ? "rated" : "casual"} · {g.sans.length} moves
                  </p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: yourMove ? "#D4AF37" : "#8A8A93" }}>
                  {yourMove ? "Your move" : "Waiting"}
                </span>
              </Link>
            );
          })}
        </section>
      )}

      {incoming.length > 0 && (
        <section className="card" style={{ padding: 0, overflow: "hidden" }}>
          <p className="section-label" style={{ padding: "14px 18px 6px" }}>Waiting for you</p>
          {incoming.map((c, i) => (
            <div
              key={c.id}
              style={{
                display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                padding: "12px 18px",
                borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div style={{ flex: 1, minWidth: 150 }}>
                <p style={{ fontSize: 15 }}>{c.from.profile?.fullName ?? "A player"} challenged you</p>
                <p className="text-ivory-meta digits" style={{ fontSize: 12 }}>
                  {clockLabel(c.timeControl)} · {c.rated ? "rated" : "casual"}
                  {c.color !== "random" && ` · they take ${c.color}`}
                </p>
                {c.message && (
                  <p style={{ fontSize: 14, color: "#B5B5BE", marginTop: 4, fontStyle: "italic" }}>
                    “{c.message}”
                  </p>
                )}
              </div>
              <ChallengeActions challengeId={c.id} />
            </div>
          ))}
        </section>
      )}

      <ChallengeBuilder />

      {outgoing.length > 0 && (
        <section className="card" style={{ padding: 0, overflow: "hidden" }}>
          <p className="section-label" style={{ padding: "14px 18px 6px" }}>Sent</p>
          {outgoing.map((c, i) => (
            <div
              key={c.id}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 18px",
                borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15 }}>Waiting on {c.to.profile?.fullName ?? "player"}</p>
                <p className="text-ivory-meta digits" style={{ fontSize: 12 }}>
                  {clockLabel(c.timeControl)} · {c.rated ? "rated" : "casual"}
                </p>
              </div>
              <ChallengeActions challengeId={c.id} mine />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
