import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notifications";
import { pairNextRound, standings, finalizeTournament } from "@/lib/services/tournament";

/**
 * Club night — the weekly rhythm.
 *
 * Real clubs run on a weekly beat: same evening, same room, whoever
 * turns up. Regular events are the cornerstone of an active community
 * and no chess platform models that rhythm at all; they model
 * tournaments, which are occasions, not habits.
 *
 * A club night runs AS a tournament rather than beside one. The Swiss
 * pairing in services/tournament.ts already generates pairings, opens
 * a round, creates real games on real clocks, handles full and half
 * byes and notifies every player — so club night creates a small
 * Tournament and calls it. A second pairing implementation would be a
 * second thing to get wrong.
 */

/** How long before kick-off the countdown appears. */
export const COUNTDOWN_MS = 24 * 60 * 60 * 1000;

/** Someone who RSVP'd but never checked in is not kept waiting for. */
export const CHECKIN_GRACE_MS = 10 * 60 * 1000;

/** The next occurrence of a weekly slot, from a given moment. */
export function nextOccurrence(from: Date, startsAt: Date): Date {
  const next = new Date(startsAt);
  while (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 7);
  }
  return next;
}

export interface ClubNightView {
  id: string;
  clubSlug: string;
  clubName: string;
  dayOfWeek: number;
  startsAt: Date;
  timeControl: string;
  rounds: number;
  state: "SCHEDULED" | "LIVE" | "FINISHED" | "CANCELLED";
  tournamentId: string | null;
  msUntil: number;
  /** Within the countdown window, or already under way. */
  imminent: boolean;
  startable: boolean;
  going: { userId: string; name: string; country: string | null; title: string | null }[];
  maybe: number;
  yourState: "GOING" | "MAYBE" | "OUT" | null;
}

/** The club's next club night, with everything a card needs. */
export async function clubNightFor(clubId: string, userId: string | null): Promise<ClubNightView | null> {
  const night = await prisma.clubNight.findFirst({
    where: { clubId, active: true, state: { in: ["SCHEDULED", "LIVE"] } },
    orderBy: { startsAt: "asc" },
    include: {
      club: { select: { slug: true, name: true } },
      rsvps: { include: { user: { include: { profile: true } } } },
    },
  });
  if (!night) return null;

  const msUntil = night.startsAt.getTime() - Date.now();
  const going = night.rsvps.filter((r) => r.state === "GOING");

  return {
    id: night.id,
    clubSlug: night.club.slug,
    clubName: night.club.name,
    dayOfWeek: night.dayOfWeek,
    startsAt: night.startsAt,
    timeControl: night.timeControl,
    rounds: night.rounds,
    state: night.state,
    tournamentId: night.tournamentId,
    msUntil,
    imminent: msUntil <= COUNTDOWN_MS,
    // Two players is a club night. One is a person waiting.
    startable: night.state === "SCHEDULED" && msUntil <= 0 && going.length >= 2,
    going: going.map((r) => ({
      userId: r.userId,
      name: r.user.profile?.fullName ?? "A member",
      country: r.user.profile?.country ?? null,
      title: r.user.profile?.title ?? null,
    })),
    maybe: night.rsvps.filter((r) => r.state === "MAYBE").length,
    yourState: userId ? (night.rsvps.find((r) => r.userId === userId)?.state ?? null) : null,
  };
}

/**
 * Start it: build the tournament, seat whoever is actually here, pair
 * round one.
 *
 * "Whoever is actually here" is the part that matters. An RSVP is an
 * intention made days ago; the people who checked in are the ones in
 * the room. Pairing the intentions would seat ghosts and give half
 * the room a bye against nobody.
 */
export async function startClubNight(clubNightId: string) {
  const night = await prisma.clubNight.findUnique({
    where: { id: clubNightId },
    include: { club: true, rsvps: true },
  });
  if (!night) throw new Error("no_such_club_night");
  if (night.state !== "SCHEDULED") return { alreadyStarted: true, tournamentId: night.tournamentId };

  const cutoff = new Date(Date.now() - CHECKIN_GRACE_MS);
  const seated = night.rsvps.filter(
    (r) => r.state === "GOING" && r.checkedInAt && r.checkedInAt >= cutoff,
  );
  // Nobody checked in: fall back to those who said they were coming,
  // rather than cancelling a night people turned up to.
  const players = seated.length >= 2 ? seated : night.rsvps.filter((r) => r.state === "GOING");
  if (players.length < 2) throw new Error("not_enough_players");

  const when = night.startsAt;
  const name = `${night.club.name} club night — ${when.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;

  const tournament = await prisma.tournament.create({
    data: {
      clubId: night.clubId,
      name,
      format: "SWISS",
      totalRounds: night.rounds,
      timeControlDetail: night.timeControl,
      status: "REGISTRATION",
      startsAt: when,
      entries: { create: players.map((p) => ({ userId: p.userId })) },
    },
  });

  // The existing Swiss engine does the rest: pairings, the round,
  // a real game per board with the right clock, byes, and the
  // PAIRING notification to every player.
  await pairNextRound(tournament.id);

  await prisma.clubNight.update({
    where: { id: clubNightId },
    data: { state: "LIVE", tournamentId: tournament.id },
  });

  return { tournamentId: tournament.id, seated: players.length };
}

/**
 * Close it out: final standings, a recap post, and the slot rolled
 * forward to next week.
 *
 * Rolling forward is what makes it a rhythm instead of an event. A
 * club night that has to be recreated every week is a club night that
 * stops happening in March.
 */
export async function finishClubNight(clubNightId: string) {
  const night = await prisma.clubNight.findUnique({
    where: { id: clubNightId },
    include: { club: true },
  });
  if (!night || night.state !== "LIVE" || !night.tournamentId) return null;

  const table = await standings(night.tournamentId);
  await finalizeTournament(night.tournamentId).catch(() => {});

  const top = table.slice(0, 3);
  const winner = top[0];

  // The biggest upset of the night, which is the thing people retell.
  const games = await prisma.liveGame.findMany({
    where: {
      status: { not: "ACTIVE" },
      match: { round: { tournamentId: night.tournamentId } },
      result: { not: null },
    },
    include: { white: { include: { profile: true } }, black: { include: { profile: true } } },
  });

  let upset: { winner: string; loser: string; gap: number } | null = null;
  for (const g of games) {
    if (g.result === "1/2-1/2" || g.whiteRatingBefore == null || g.blackRatingBefore == null) continue;
    const whiteWon = g.result === "1-0";
    const gap = whiteWon
      ? g.blackRatingBefore - g.whiteRatingBefore
      : g.whiteRatingBefore - g.blackRatingBefore;
    if (gap > 0 && (!upset || gap > upset.gap)) {
      upset = {
        winner: (whiteWon ? g.white : g.black).profile?.fullName ?? "Someone",
        loser: (whiteWon ? g.black : g.white).profile?.fullName ?? "someone",
        gap: Math.round(gap),
      };
    }
  }

  const lines = [
    `${night.club.name} club night — ${table.length} played, ${games.length} games.`,
    winner ? `Winner: ${winner.player?.fullName ?? "—"} on ${winner.score}.` : null,
    upset ? `Biggest upset: ${upset.winner} beat ${upset.loser}, ${upset.gap} points above them.` : null,
  ].filter(Boolean);

  // Authored by the club's owner, because a post needs an author and
  // inventing a system user to hold one is worse.
  const owner = await prisma.membership.findFirst({
    where: { clubId: night.clubId, role: "OWNER", active: true },
    select: { userId: true },
  });
  if (owner) {
    await prisma.post.create({
      data: {
        clubId: night.clubId,
        authorId: owner.userId,
        type: "MILESTONE",
        body: lines.join("\n"),
        pinned: false,
      },
    });
  }

  // Next week, same time.
  await prisma.clubNight.update({
    where: { id: clubNightId },
    data: {
      state: "SCHEDULED",
      tournamentId: null,
      startsAt: nextOccurrence(new Date(), night.startsAt),
    },
  });

  const played = await prisma.clubNightRsvp.findMany({
    where: { clubNightId, state: "GOING" },
    select: { userId: true },
  });
  if (played.length > 0) {
    await notify({
      userIds: played.map((p) => p.userId),
      type: "CLUB_ANNOUNCEMENT",
      title: `${night.club.name} club night is done`,
      body: winner ? `${winner.player?.fullName ?? "Someone"} won it.` : undefined,
      linkUrl: `/club/${night.club.slug}`,
    });
  }

  return { recap: lines.join(" ") };
}
