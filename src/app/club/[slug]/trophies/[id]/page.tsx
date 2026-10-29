import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rollOfHonour } from "@/lib/services/trophies";
import { canAwardHonours } from "@/lib/services/officers";
import { RollOfHonour } from "@/components/trophy/RollOfHonour";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await prisma.trophy.findUnique({ where: { id }, select: { name: true } });
  return { title: t?.name ?? "Roll of honour" };
}

export default async function RollOfHonourPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;

  const trophy = await rollOfHonour(id);
  if (!trophy || trophy.clubSlug !== slug) notFound();

  const membership = userId
    ? await prisma.membership.findFirst({
        where: { userId, club: { slug }, active: true },
        select: { role: true },
      })
    : null;

  return <RollOfHonour trophy={trophy} officer={canAwardHonours(membership?.role)} />;
}
