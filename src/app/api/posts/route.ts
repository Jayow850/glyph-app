import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireRole, can } from "@/lib/rbac";
import { invalidate } from "@/lib/redis";
import { touchStreak } from "@/lib/services/social";

const CreatePost = z.object({
  clubId: z.string().optional(), // omit = global feed
  type: z.enum(["TEXT", "PHOTO", "VIDEO", "GAME", "PUZZLE", "CLIP", "LIVE"]).default("TEXT"),
  body: z.string().max(5000).optional(),
  mediaUrls: z.array(z.string().url()).max(10).default([]),
  videoUrl: z.string().url().optional(),
  durationSec: z.number().int().positive().optional(),
  isStudio: z.boolean().default(false),
  pgn: z.string().max(20000).optional(),
  criticalPly: z.number().int().optional(),
  puzzleFen: z.string().optional(),
  puzzleSolution: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.type === "TEXT" && !v.body?.trim()) ctx.addIssue({ code: "custom", message: "Text posts need a body" });
  if (v.type === "PHOTO" && v.mediaUrls.length === 0) ctx.addIssue({ code: "custom", message: "Photo posts need images" });
  if ((v.type === "VIDEO" || v.type === "CLIP") && !v.videoUrl) ctx.addIssue({ code: "custom", message: "Video posts need videoUrl" });
  if (v.type === "CLIP" && v.durationSec && (v.durationSec < 15 || v.durationSec > 60)) ctx.addIssue({ code: "custom", message: "Clips are 15-60s" });
  if (v.type === "VIDEO" && !v.isStudio && v.durationSec && v.durationSec > 180) ctx.addIssue({ code: "custom", message: "Feed videos max 3 min — longer goes to Studio" });
  if (v.type === "VIDEO" && v.isStudio && v.durationSec && v.durationSec > 1800) ctx.addIssue({ code: "custom", message: "Studio max 30 min" });
  if (v.type === "GAME" && !v.pgn) ctx.addIssue({ code: "custom", message: "Game posts need PGN" });
  if (v.type === "PUZZLE" && (!v.puzzleFen || !v.puzzleSolution)) ctx.addIssue({ code: "custom", message: "Puzzles need position + solution" });
});

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const body = CreatePost.parse(await req.json());
  if (body.clubId) await requireRole(userId, body.clubId, can.post);

  const post = await prisma.post.create({
    data: { ...body, authorId: userId },
    include: { author: { include: { profile: true } } },
  });
  await touchStreak(userId);
  await invalidate("feed:");
  return NextResponse.json(post, { status: 201 });
}
