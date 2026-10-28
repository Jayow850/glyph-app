import { prisma } from "../prisma";
import { invalidate } from "../redis";
import { notify } from "./notifications";
import type { ReactionKind } from "@prisma/client";

/**
 * What each reaction is called in a notification.
 *
 * Partial on purpose: a Record<ReactionKind, string> has to be edited
 * every time a kind is added or the build breaks, which is how the
 * emoji map this replaced fell over. A missing entry falls back
 * instead of failing.
 */
const REACTION_WORD: Partial<Record<ReactionKind, string>> = {
  PAWN: "Respect",
  BRILLIANT: "Brilliant",
  FIRE: "Nice move",
  SHOCK: "Blunder",
  WELCOME: "A welcome",
};

/** Toggle a reaction. Brilliants snapshot the reactor's Elo ("GM-approved"). */
export async function react(userId: string, kind: ReactionKind, target: { postId?: string; commentId?: string; messageId?: string }) {
  const existing = await prisma.reaction.findFirst({ where: { userId, kind, ...target } });
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    return { toggled: "off" };
  }
  const rating = await prisma.rating.findFirst({ where: { userId, clubId: null }, orderBy: { current: "desc" } });
  await prisma.reaction.create({ data: { userId, kind, reactorElo: rating?.current, ...target } });

  if (target.postId) {
    await invalidate("feed:");
    const post = await prisma.post.findUnique({ where: { id: target.postId } });
    if (post && post.authorId !== userId) {
      await notify({
        userIds: [post.authorId],
        type: "SYSTEM",
        title: `${REACTION_WORD[kind] ?? "A reaction"} on your post`,
        linkUrl: `/post/${post.id}`,
      });
    }
  }
  return { toggled: "on" };
}

/** Comment on any post — including videos. Supports threads + 15s video replies. */
export async function comment(userId: string, postId: string, body: string | undefined, videoUrl?: string, parentId?: string) {
  if (!body?.trim() && !videoUrl) throw new Response("Empty comment", { status: 400 });
  const c = await prisma.comment.create({
    data: { postId, authorId: userId, body, videoUrl, parentId },
    include: { author: { include: { profile: true } } },
  });
  const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
  if (post.authorId !== userId) {
    await notify({ userIds: [post.authorId], type: "SYSTEM", title: "New comment on your post", linkUrl: `/post/${postId}` });
  }
  return c;
}

export async function follow(followerId: string, handle: string) {
  const target = await prisma.profile.findUniqueOrThrow({ where: { handle } });
  if (target.userId === followerId) throw new Response("Cannot follow yourself", { status: 400 });
  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId: target.userId } },
  });
  if (existing) {
    await prisma.follow.delete({ where: { id: existing.id } });
    return { following: false };
  }
  await prisma.follow.create({ data: { followerId, followingId: target.userId } });
  await notify({ userIds: [target.userId], type: "SYSTEM", title: "You have a new follower" });
  return { following: true };
}

/** Score a puzzle attempt and update the daily streak. */
export async function solvePuzzle(userId: string, postId: string, answer: string) {
  const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
  if (post.type !== "PUZZLE" || !post.puzzleSolution) throw new Response("Not a puzzle", { status: 400 });
  const correct = answer.trim() === post.puzzleSolution.trim();

  await prisma.post.update({
    where: { id: postId },
    data: { attemptCount: { increment: 1 }, ...(correct ? { solveCount: { increment: 1 } } : {}) },
  });
  if (correct) await touchStreak(userId);

  return {
    correct,
    solveCount: post.solveCount + (correct ? 1 : 0),
    attemptCount: post.attemptCount + 1,
  };
}

/** Daily streak with the gold flame. Resets after a missed day. */
export async function touchStreak(userId: string) {
  const s = await prisma.streak.upsert({ where: { userId }, create: { userId, current: 1, best: 1, lastActiveAt: new Date() }, update: {} });
  const last = s.lastActiveAt ? new Date(s.lastActiveAt) : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lastDay = last ? new Date(last.setHours(0, 0, 0, 0)) : null;
  if (lastDay && lastDay.getTime() === today.getTime()) return s; // already counted today
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const current = lastDay && lastDay.getTime() === yesterday.getTime() ? s.current + 1 : 1;
  return prisma.streak.update({
    where: { userId },
    data: { current, best: Math.max(s.best, current), lastActiveAt: new Date() },
  });
}

export async function bookmark(userId: string, postId: string, folderName?: string) {
  const existing = await prisma.bookmark.findUnique({ where: { userId_postId: { userId, postId } } });
  if (existing) {
    await prisma.bookmark.delete({ where: { id: existing.id } });
    await prisma.post.update({ where: { id: postId }, data: { saveCount: { decrement: 1 } } }).catch(() => {});
    return { bookmarked: false };
  }
  let folderId: string | undefined;
  if (folderName) {
    const folder = await prisma.bookmarkFolder.upsert({
      where: { userId_name: { userId, name: folderName } },
      create: { userId, name: folderName },
      update: {},
    });
    folderId = folder.id;
  }
  await prisma.bookmark.create({ data: { userId, postId, folderId } });
  await prisma.post.update({ where: { id: postId }, data: { saveCount: { increment: 1 } } }).catch(() => {});
  return { bookmarked: true };
}

/** Share a post: increments the counter, returns the canonical share URL.
 *  Sharing is allowed for guests too — big-app behavior. */
export async function sharePost(postId: string) {
  const post = await prisma.post.update({
    where: { id: postId },
    data: { shareCount: { increment: 1 } },
  });
  return { url: `${process.env.NEXTAUTH_URL}/post/${post.id}`, shareCount: post.shareCount };
}

/** Friends = mutual follows, like every big social app. */
export async function friendsOf(userId: string) {
  const [iFollow, followMe] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
    prisma.follow.findMany({ where: { followingId: userId }, select: { followerId: true } }),
  ]);
  const mine = new Set(iFollow.map((f) => f.followingId));
  const friendIds = followMe.map((f) => f.followerId).filter((id) => mine.has(id));
  return prisma.user.findMany({
    where: { id: { in: friendIds } },
    include: { profile: true, ratings: { where: { clubId: null, timeControl: "RAPID" } } },
  });
}

/** Streak freeze: spend one to save a missed day, Duolingo-style. */
export async function useStreakFreeze(userId: string) {
  const s = await prisma.streak.findUnique({ where: { userId } });
  if (!s || s.freezes < 1) throw new Response("No streak freezes left", { status: 400 });
  return prisma.streak.update({
    where: { userId },
    data: { freezes: { decrement: 1 }, lastActiveAt: new Date() },
  });
}