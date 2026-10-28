import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

/** A watcher who has not pinged in this long has wandered off. */
const PRESENCE_MS = 25_000;

/**
 * Reactions reach the players late, on purpose.
 *
 * A spectator tapping "blunder" the instant a piece lands is a hint,
 * and a hint is cheating — the research on kibitzing is unambiguous.
 * Holding every reaction back by this much keeps the warmth of a room
 * reacting and removes the signal: by the time a player sees it, the
 * moment to act on it has passed.
 */
const REACTION_DELAY_MS = 6_000;

/** Per person, per game. The rail cheers; it does not spam. */
const REACTION_WINDOW_MS = 10_000;
const REACTION_LIMIT = 3;

const Body = z.object({
  action: z.enum(["watch", "leave", "back"]),
  /** For "back": "w", "b", or null to stop backing anyone. */
  side: z.enum(["w", "b"]).nullable().optional(),
});

/**
 * The rail's heartbeat. One round trip answers everything the strip
 * under the board needs: who is here, who they are backing, and which
 * reactions have matured enough to show.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;
  const { id } = await params;

  const game = await prisma.liveGame.findUnique({
    where: { id },
    select: { id: true, whiteId: true, blackId: true, status: true },
  });
  if (!game) return NextResponse.json({ error: "no_such_game" }, { status: 404 });

  const body = Body.parse(await req.json().catch(() => ({ action: "watch" })));
  const isPlayer = userId === game.whiteId || userId === game.blackId;
  const now = new Date();

  // Players are at the board, not on the rail. They are never listed as
  // watching their own game.
  if (userId && !isPlayer) {
    if (body.action === "leave") {
      await prisma.spectator.deleteMany({ where: { liveGameId: id, userId } });
    } else if (body.action === "back") {
      await prisma.spectator.upsert({
        where: { liveGameId_userId: { liveGameId: id, userId } },
        create: { liveGameId: id, userId, backing: body.side ?? null, lastSeenAt: now },
        update: { backing: body.side ?? null, lastSeenAt: now },
      });
    } else {
      await prisma.spectator.upsert({
        where: { liveGameId_userId: { liveGameId: id, userId } },
        create: { liveGameId: id, userId, lastSeenAt: now },
        update: { lastSeenAt: now },
      });
    }
  }

  const since = new Date(now.getTime() - PRESENCE_MS);

  const [watchers, reactions, muted] = await Promise.all([
    prisma.spectator.findMany({
      where: { liveGameId: id, lastSeenAt: { gte: since } },
      include: { user: { include: { profile: true } } },
      orderBy: { joinedAt: "asc" },
      take: 24,
    }),
    // Only what has matured. A player polling early simply sees nothing.
    prisma.railReaction.findMany({
      where: { liveGameId: id, showAt: { lte: now } },
      orderBy: { showAt: "desc" },
      take: 12,
    }),
    userId
      ? prisma.profile.findUnique({ where: { userId }, select: { railMuted: true } })
      : Promise.resolve(null),
  ]);

  const backing = { w: 0, b: 0 };
  for (const s of watchers) {
    if (s.backing === "w") backing.w++;
    else if (s.backing === "b") backing.b++;
  }

  return NextResponse.json({
    you: { isPlayer, backing: watchers.find((s) => s.userId === userId)?.backing ?? null },
    count: watchers.length,
    watchers: watchers.map((s) => ({
      id: s.userId,
      name: s.user.profile?.fullName ?? "A member",
      handle: s.user.profile?.handle ?? "",
      country: s.user.profile?.country ?? null,
      title: s.user.profile?.title ?? null,
      backing: s.backing,
    })),
    backing,
    // A player who muted the rail is told nothing, rather than being
    // sent reactions the client is trusted to hide.
    reactions: isPlayer && muted?.railMuted
      ? []
      : reactions.map((r) => ({ id: r.id, kind: r.kind, at: r.showAt.getTime() })),
    finished: game.status !== "ACTIVE",
  });
}

const React_ = z.object({
  kind: z.enum(["BRILLIANT", "BLUNDER", "NICE", "RESPECT"]),
  ply: z.number().int().min(0).max(1000).default(0),
});

/** Send a reaction. Spectators only, rate-limited, and held back. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "sign_in" }, { status: 401 });

  const { id } = await params;
  const game = await prisma.liveGame.findUnique({
    where: { id },
    select: { whiteId: true, blackId: true, status: true },
  });
  if (!game) return NextResponse.json({ error: "no_such_game" }, { status: 404 });

  // The players cannot react to their own game. Obvious, and the one
  // place where forgetting it would be a real exploit.
  if (userId === game.whiteId || userId === game.blackId) {
    return NextResponse.json({ error: "players_cannot_react" }, { status: 403 });
  }

  const recent = await prisma.railReaction.count({
    where: { liveGameId: id, userId, createdAt: { gte: new Date(Date.now() - REACTION_WINDOW_MS) } },
  });
  if (recent >= REACTION_LIMIT) {
    return NextResponse.json({ error: "too_fast" }, { status: 429 });
  }

  const body = React_.parse(await req.json());
  await prisma.railReaction.create({
    data: {
      liveGameId: id,
      userId,
      kind: body.kind,
      ply: body.ply,
      showAt: new Date(Date.now() + REACTION_DELAY_MS),
    },
  });

  return NextResponse.json({ ok: true, delayedMs: REACTION_DELAY_MS });
}
