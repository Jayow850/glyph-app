import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/ui/Avatar";
import { Flag } from "@/components/ui/Flag";
import { Thread } from "@/components/messages/Thread";
import { AcceptRequest } from "@/components/messages/AcceptRequest";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) notFound();

  const room = await prisma.chatRoom.findUnique({
    where: { id },
    include: {
      members: { include: { user: { include: { profile: true } } } },
      messages: { orderBy: { createdAt: "asc" }, take: 1, select: { senderId: true } },
    },
  });

  // Membership is the authorisation. A room id is not a key.
  if (!room || !room.members.some((m) => m.userId === userId)) notFound();

  const other = room.members.find((m) => m.userId !== userId)?.user;
  const pending = room.isRequest && !room.acceptedAt;
  const opener = room.messages[0]?.senderId ?? null;
  const youOpened = opener === userId;

  return (
    <div
      className="page-bottom"
      style={{ paddingTop: "var(--s3)", display: "flex", flexDirection: "column", gap: "var(--s3)", minHeight: "70vh" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)" }}>
        <Link href="/messages" aria-label="Back" className="tap press" style={{ display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
          </svg>
        </Link>

        <Link
          href={other?.profile?.handle ? `/profile/${other.profile.handle}` : "/messages"}
          style={{ display: "flex", alignItems: "center", gap: "var(--s3)", flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}
        >
          <Avatar name={other?.profile?.fullName ?? "A player"} size={36} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="t-row" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {other?.profile?.fullName ?? "A player"}
              </span>
              {other?.profile?.country && <Flag code={other.profile.country} height={12} />}
            </div>
            {other?.profile?.handle && <p className="t-rowmeta">@{other.profile.handle}</p>}
          </div>
        </Link>
      </div>

      {/* Their request, waiting on you. Accepting is what opens the
          thread both ways — until then they get one message. */}
      {pending && !youOpened && <AcceptRequest roomId={room.id} name={other?.profile?.fullName ?? "They"} />}

      <Thread roomId={room.id} youId={userId} pending={pending} youOpened={youOpened} />
    </div>
  );
}
