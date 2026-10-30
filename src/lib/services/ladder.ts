import { prisma } from "@/lib/prisma";

/**
 * The club ladder.
 *
 * A ladder is a column of names. You challenge someone above you; if
 * you win, you take their rung and everyone between shuffles down one.
 * That is the whole game, and it has run on a corkboard in club halls
 * for a century.
 *
 * The documented reason club ladders die is rule complexity, so there
 * are exactly four rules and a secretary can see all of them at once:
 *
 *   range      — how far above you may reach
 *   cooldown   — how long before the same pair may meet again
 *   maxPerWeek — how often one person may be challenged
 *   maxDeclines— how many refusals before the next is auto-accepted
 *
 * Every one of them exists to protect somebody. Range stops the bottom
 * rung from farming the top. Cooldown stops a grudge match becoming the
 * whole ladder. MaxPerWeek stops the strongest player being worn down
 * by everyone at once. MaxDeclines stops a rung being held by someone
 * who never plays — which is the single most common way these die.
 */

/** How long a challenge stands before it lapses. */
const CHALLENGE_DAYS = 10;
const DAY_MS = 86_400_000;

export interface Rung {
  position: number;
  userId: string;
  name: string;
  handle: string | null;
  country: string | null;
  movedAt: Date;
  /**
   * A live challenge this member is in, either way.
   *
   * `state` matters: an ACCEPTED challenge is still live, but there is
   * nothing left to accept. Without it the board offered Accept on an
   * already-accepted challenge and the server rightly refused.
   */
  openChallenge: {
    id: string;
    role: "challenger" | "defender";
    state: "OPEN" | "ACCEPTED";
    otherName: string;
    otherId: string;
  } | null;
}

export interface LadderRules {
  range: number;
  cooldownDays: number;
  maxPerWeek: number;
  maxDeclines: number;
}

const RUNG_SELECT = {
  position: true,
  userId: true,
  movedAt: true,
  user: {
    select: {
      profile: { select: { fullName: true, handle: true, country: true } },
    },
  },
} as const;

const CHALLENGE_SELECT = {
  id: true,
  clubId: true,
  challengerId: true,
  defenderId: true,
  state: true,
  rungGap: true,
  liveGameId: true,
  createdAt: true,
  expiresAt: true,
  challenger: { select: { profile: { select: { fullName: true, handle: true } } } },
  defender: { select: { profile: { select: { fullName: true, handle: true } } } },
} as const;

export function rulesOf(club: {
  ladderRange: number;
  ladderCooldownDays: number;
  ladderMaxPerWeek: number;
  ladderMaxDeclines: number;
}): LadderRules {
  return {
    range: club.ladderRange,
    cooldownDays: club.ladderCooldownDays,
    maxPerWeek: club.ladderMaxPerWeek,
    maxDeclines: club.ladderMaxDeclines,
  };
}

/** The ladder as it stands, top rung first. */
export async function ladder(clubId: string): Promise<Rung[]> {
  const [rungs, open] = await Promise.all([
    prisma.ladderRung.findMany({
      where: { clubId },
      select: RUNG_SELECT,
      orderBy: { position: "asc" },
    }),
    prisma.ladderChallenge.findMany({
      where: { clubId, state: { in: ["OPEN", "ACCEPTED"] } },
      select: CHALLENGE_SELECT,
    }),
  ]);

  const nameOf = (c: (typeof open)[number], who: "challenger" | "defender") =>
    (who === "challenger" ? c.challenger : c.defender).profile?.fullName ?? "A member";

  return rungs.map((r) => {
    const asChallenger = open.find((c) => c.challengerId === r.userId);
    const asDefender = open.find((c) => c.defenderId === r.userId);
    const c = asChallenger ?? asDefender;

    return {
      position: r.position,
      userId: r.userId,
      name: r.user.profile?.fullName ?? "A member",
      handle: r.user.profile?.handle ?? null,
      country: r.user.profile?.country ?? null,
      movedAt: r.movedAt,
      openChallenge: c
        ? {
            id: c.id,
            role: asChallenger ? ("challenger" as const) : ("defender" as const),
            state: c.state === "ACCEPTED" ? ("ACCEPTED" as const) : ("OPEN" as const),
            otherName: asChallenger ? nameOf(c, "defender") : nameOf(c, "challenger"),
            otherId: asChallenger ? c.defenderId : c.challengerId,
          }
        : null,
    };
  });
}

/**
 * Why a challenge is or is not allowed.
 *
 * Returned as a reason string rather than a boolean, because the UI has
 * to tell the member which rule stopped them. "You can't challenge yet"
 * is the message that makes people stop using a ladder.
 */
export type Eligibility = { ok: true; rungGap: number } | { ok: false; reason: string };

export async function canChallenge(
  clubId: string,
  challengerId: string,
  defenderId: string,
): Promise<Eligibility> {
  if (challengerId === defenderId) {
    return { ok: false, reason: "You cannot challenge yourself." };
  }

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: {
      ladderRange: true,
      ladderCooldownDays: true,
      ladderMaxPerWeek: true,
      ladderMaxDeclines: true,
    },
  });
  if (!club) return { ok: false, reason: "Club not found." };
  const rules = rulesOf(club);

  const [mine, theirs] = await Promise.all([
    prisma.ladderRung.findUnique({
      where: { clubId_userId: { clubId, userId: challengerId } },
      select: { position: true },
    }),
    prisma.ladderRung.findUnique({
      where: { clubId_userId: { clubId, userId: defenderId } },
      select: { position: true },
    }),
  ]);
  if (!mine) return { ok: false, reason: "You are not on the ladder yet." };
  if (!theirs) return { ok: false, reason: "They are not on the ladder." };

  // Position 1 is the top rung, so a smaller number is higher up.
  const rungGap = mine.position - theirs.position;
  if (rungGap <= 0) {
    return { ok: false, reason: "You can only challenge upwards." };
  }
  if (rungGap > rules.range) {
    return {
      ok: false,
      reason: `You may challenge up to ${rules.range} ${rules.range === 1 ? "rung" : "rungs"} above you.`,
    };
  }

  const now = new Date();

  // One live challenge at a time, either way round. Two at once and the
  // rung swap becomes ambiguous.
  const existing = await prisma.ladderChallenge.findFirst({
    where: {
      clubId,
      state: { in: ["OPEN", "ACCEPTED"] },
      OR: [
        { challengerId },
        { defenderId: challengerId },
        { challengerId: defenderId },
        { defenderId },
      ],
    },
    select: { challengerId: true, defenderId: true },
  });
  if (existing) {
    const yours = existing.challengerId === challengerId || existing.defenderId === challengerId;
    return {
      ok: false,
      reason: yours
        ? "You already have a challenge running. Finish that one first."
        : "They already have a challenge running.",
    };
  }

  // Cooldown: the same pair, in either direction.
  const since = new Date(now.getTime() - rules.cooldownDays * DAY_MS);
  const recent = await prisma.ladderChallenge.findFirst({
    where: {
      clubId,
      state: "PLAYED",
      resolvedAt: { gte: since },
      OR: [
        { challengerId, defenderId },
        { challengerId: defenderId, defenderId: challengerId },
      ],
    },
    select: { resolvedAt: true },
  });
  if (recent?.resolvedAt) {
    const daysLeft = Math.max(
      1,
      Math.ceil((recent.resolvedAt.getTime() + rules.cooldownDays * DAY_MS - now.getTime()) / DAY_MS),
    );
    return {
      ok: false,
      reason: `You played them recently. ${daysLeft} ${daysLeft === 1 ? "day" : "days"} to go.`,
    };
  }

  // Nobody is worn down by the whole club at once.
  const week = new Date(now.getTime() - 7 * DAY_MS);
  const thisWeek = await prisma.ladderChallenge.count({
    where: { clubId, defenderId, createdAt: { gte: week }, state: { not: "EXPIRED" } },
  });
  if (thisWeek >= rules.maxPerWeek) {
    return { ok: false, reason: "They have had their challenges for this week." };
  }

  return { ok: true, rungGap };
}

/**
 * Issue a challenge.
 *
 * Auto-accepts when the defender has declined `maxDeclines` in a row —
 * a rung you hold by refusing games is the thing that kills a ladder.
 */
export async function challenge(clubId: string, challengerId: string, defenderId: string) {
  const check = await canChallenge(clubId, challengerId, defenderId);
  if (!check.ok) return { ok: false as const, error: check.reason };

  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { ladderMaxDeclines: true },
  });
  const maxDeclines = club?.ladderMaxDeclines ?? 2;

  // Consecutive declines, most recent first — any PLAYED game resets it.
  const recent = await prisma.ladderChallenge.findMany({
    where: { clubId, defenderId, state: { in: ["DECLINED", "PLAYED"] } },
    select: { state: true },
    orderBy: { resolvedAt: "desc" },
    take: maxDeclines,
  });
  const streak = recent.findIndex((c) => c.state === "PLAYED");
  const declinesInARow = streak === -1 ? recent.length : streak;
  const autoAccepted = declinesInARow >= maxDeclines;

  const created = await prisma.ladderChallenge.create({
    data: {
      clubId,
      challengerId,
      defenderId,
      rungGap: check.rungGap,
      state: autoAccepted ? "ACCEPTED" : "OPEN",
      expiresAt: new Date(Date.now() + CHALLENGE_DAYS * DAY_MS),
    },
    select: { id: true, state: true },
  });

  return { ok: true as const, id: created.id, autoAccepted };
}

/** The defender answers. */
export async function respond(challengeId: string, userId: string, accept: boolean) {
  const c = await prisma.ladderChallenge.findUnique({
    where: { id: challengeId },
    select: { id: true, defenderId: true, state: true },
  });
  if (!c) return { ok: false as const, error: "No such challenge." };
  if (c.defenderId !== userId) return { ok: false as const, error: "That challenge is not yours to answer." };
  if (c.state !== "OPEN") return { ok: false as const, error: "That challenge has already been answered." };

  await prisma.ladderChallenge.update({
    where: { id: challengeId },
    data: { state: accept ? "ACCEPTED" : "DECLINED", resolvedAt: new Date() },
  });
  return { ok: true as const };
}

/**
 * The game was played. Swap the rungs if the challenger won.
 *
 * The challenger takes the defender's rung and everyone from there down
 * to the challenger's old rung shifts one step lower. A draw leaves the
 * ladder alone — the defender holds, which is the traditional rule and
 * the one that keeps the top of the ladder worth defending.
 *
 * Done in a transaction and in two passes, because `[clubId, position]`
 * is unique: positions are parked negative first so no intermediate
 * state collides.
 */
export async function recordResult(
  challengeId: string,
  winnerId: string | null,
  liveGameId?: string,
) {
  const c = await prisma.ladderChallenge.findUnique({
    where: { id: challengeId },
    select: { id: true, clubId: true, challengerId: true, defenderId: true, state: true },
  });
  if (!c) return { ok: false as const, error: "No such challenge." };
  if (c.state !== "ACCEPTED") {
    return { ok: false as const, error: "That challenge was not accepted." };
  }

  const challengerWon = winnerId === c.challengerId;

  await prisma.$transaction(async (tx) => {
    await tx.ladderChallenge.update({
      where: { id: challengeId },
      data: { state: "PLAYED", resolvedAt: new Date(), liveGameId: liveGameId ?? null },
    });

    if (!challengerWon) return;

    const [from, to] = await Promise.all([
      tx.ladderRung.findUnique({
        where: { clubId_userId: { clubId: c.clubId, userId: c.challengerId } },
        select: { position: true },
      }),
      tx.ladderRung.findUnique({
        where: { clubId_userId: { clubId: c.clubId, userId: c.defenderId } },
        select: { position: true },
      }),
    ]);
    if (!from || !to || from.position <= to.position) return;

    const block = await tx.ladderRung.findMany({
      where: { clubId: c.clubId, position: { gte: to.position, lt: from.position } },
      select: { id: true, position: true },
    });

    // Park out of the way first: [clubId, position] is unique, so a
    // straight increment would collide with the row above it.
    await Promise.all(
      block.map((r) =>
        tx.ladderRung.update({ where: { id: r.id }, data: { position: -r.position } }),
      ),
    );
    await Promise.all(
      block.map((r) =>
        tx.ladderRung.update({
          where: { id: r.id },
          data: { position: r.position + 1, movedAt: new Date() },
        }),
      ),
    );
    await tx.ladderRung.update({
      where: { clubId_userId: { clubId: c.clubId, userId: c.challengerId } },
      data: { position: to.position, movedAt: new Date() },
    });
  });

  if (challengerWon) await announce(c.clubId, c.challengerId, c.defenderId);
  return { ok: true as const, moved: challengerWon };
}

/** Lapse everything past its date. Called by the daily sweep. */
export async function expireStale() {
  const { count } = await prisma.ladderChallenge.updateMany({
    where: { state: "OPEN", expiresAt: { lt: new Date() } },
    data: { state: "EXPIRED", resolvedAt: new Date() },
  });
  return count;
}

/** Put a member on the bottom rung. Idempotent. */
export async function join(clubId: string, userId: string) {
  const existing = await prisma.ladderRung.findUnique({
    where: { clubId_userId: { clubId, userId } },
    select: { position: true },
  });
  if (existing) return existing.position;

  const last = await prisma.ladderRung.findFirst({
    where: { clubId },
    select: { position: true },
    orderBy: { position: "desc" },
  });
  const position = (last?.position ?? 0) + 1;
  await prisma.ladderRung.create({ data: { clubId, userId, position } });
  return position;
}

async function announce(clubId: string, winnerId: string, loserId: string) {
  const [winner, loser, owner] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: winnerId }, select: { fullName: true } }),
    prisma.profile.findUnique({ where: { userId: loserId }, select: { fullName: true } }),
    prisma.membership.findFirst({
      where: { clubId, role: "OWNER", active: true },
      select: { userId: true },
    }),
  ]);
  if (!owner) return;

  await prisma.post.create({
    data: {
      clubId,
      authorId: owner.userId,
      type: "MILESTONE",
      subjectUserId: winnerId,
      body: `${winner?.fullName ?? "A member"} takes ${loser?.fullName ?? "a member"}'s rung on the ladder.`,
    },
  });
}
