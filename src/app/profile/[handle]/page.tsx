import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ProfileView } from "@/components/ProfileView";

export default async function HandleProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await prisma.profile.findUnique({ where: { handle } });
  if (!profile) return <p style={{ paddingTop: 32 }}>No player with that handle.</p>;

  const session = await auth();
  const meId = (session?.user as { id?: string })?.id ?? null;
  return <ProfileView userId={profile.userId} isMe={meId === profile.userId} viewerId={meId} />;
}
