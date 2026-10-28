import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Create an account.
 *
 * Deliberately small: an email, a password, a name and a handle. Every
 * other thing GLYPH wants to know — your rating, what you love, which
 * club — belongs to onboarding, where it can be skipped. A signup form
 * that asks eight questions is a signup form people abandon.
 */
const Body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(2).max(80),
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "3–20 characters, letters, numbers and underscores"),
  country: z.string().length(2).optional(),
});

/** The three categories a new player starts with, at the schema's own defaults. */
const CATEGORIES = ["BULLET", "BLITZ", "RAPID"] as const;

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    const issue = e instanceof z.ZodError ? e.issues[0] : null;
    return NextResponse.json(
      { error: issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid" },
      { status: 400 },
    );
  }

  const email = body.email.trim().toLowerCase();

  // Checked up front for a useful message, and again by the unique
  // constraint below, which is the one that actually holds under a race.
  const [emailTaken, handleTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.profile.findUnique({ where: { handle: body.handle }, select: { id: true } }),
  ]);
  if (emailTaken) return NextResponse.json({ error: "That email already has an account." }, { status: 409 });
  if (handleTaken) return NextResponse.json({ error: "That handle is taken." }, { status: 409 });

  const passwordHash = await bcrypt.hash(body.password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        profile: {
          create: { fullName: body.fullName, handle: body.handle, country: body.country },
        },
        // Created up front so a new profile shows three unrated categories
        // rather than an empty space that looks broken.
        glyphRatings: { create: CATEGORIES.map((category) => ({ category })) },
      },
      select: { id: true },
    });
    return NextResponse.json({ id: user.id }, { status: 201 });
  } catch (e) {
    // P2002 is the unique constraint winning a race the check above lost.
    const code = (e as { code?: string }).code;
    if (code === "P2002") {
      return NextResponse.json({ error: "That email or handle was just taken." }, { status: 409 });
    }
    throw e;
  }
}
