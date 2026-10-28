import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ListRow, ListGroup } from "@/components/ui/ListRow";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages" };

function when(at: number) {
  const mins = Math.floor((Date.now() - at) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : `${Math.floor(days / 7)}w`;
}

/**
 * Messages.
 *
 * This route did not exist. The mail icon in the header linked to it
 * from every page in the app, so every member was one tap from a 404 —
 * while a complete DM backend sat behind it unused.
 *
 * Requests are kept separate and below, which is the whole point of
 * the gating: a stranger gets one message and it does not land in the
 * same place as your actual conversations.
 */
export default async function MessagesPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;

  if (!userId) {
    return (
      <div style={{ paddingTop: "var(--s12)", textAlign: "center" }}>
        <p className="font-display t-h1">Sign in to see your messages.</p>
      </div>
    );
  }

  const memberships = await prisma.chatRoomMember.findMany({
    where: { userId, room: { isDirect: true } },
    include: {
      room: {
        include: {
          members: { include: { user: { include: { profile: true } } } },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  const rooms = memberships
    .map((m) => {
      const other = m.room.members.find((x) => x.userId !== userId);
      const last = m.room.messages[0] ?? null;
      return {
        id: m.room.id,
        accepted: Boolean(m.room.acceptedAt) || !m.room.isRequest,
        name: other?.user.profile?.fullName ?? "A player",
        country: other?.user.profile?.country ?? null,
        title: other?.user.profile?.title ?? null,
        last,
        unread: Boolean(last && last.senderId !== userId && last.createdAt > m.lastReadAt),
        at: last?.createdAt.getTime() ?? m.room.createdAt.getTime(),
      };
    })
    .filter((r) => r.last !== null)
    .sort((a, b) => b.at - a.at);

  const inbox = rooms.filter((r) => r.accepted);
  const requests = rooms.filter((r) => !r.accepted);

  const row = (r: (typeof rooms)[number]) => (
    <ListRow
      key={r.id}
      href={`/messages/${r.id}`}
      name={r.name}
      country={r.country}
      title={r.title}
      highlight={r.unread}
      meta={[
        r.last?.body
          ? <span key="b" style={{ color: r.unread ? "var(--text)" : undefined }}>{r.last.body}</span>
          : null,
      ]}
      action={
        <span className="t-caption digits" style={{ color: r.unread ? "var(--gold)" : "var(--text-dim)" }}>
          {when(r.at)}
        </span>
      }
    />
  );

  return (
    <div className="page-bottom" style={{ paddingTop: "var(--s5)", display: "flex", flexDirection: "column", gap: "var(--s6)" }}>
      <h1 className="font-display t-display">Messages</h1>

      {inbox.length > 0 ? (
        <ListGroup>{inbox.map(row)}</ListGroup>
      ) : (
        <div
          style={{
            textAlign: "center", padding: "var(--s10) var(--s4)",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
          }}
        >
          <span style={{ color: "var(--text-dim)", display: "inline-block", marginBottom: "var(--s2)" }}>
            <Icon name="chat" size={30} />
          </span>
          <p style={{ fontWeight: 600 }}>No conversations yet.</p>
          <p className="t-secondary" style={{ marginTop: 2 }}>
            Message someone from their profile.
          </p>
          <Link
            href="/challenges"
            className="press"
            style={{
              display: "inline-block", marginTop: "var(--s4)",
              borderRadius: "var(--r-md)", padding: "var(--s3) var(--s5)",
              fontSize: "var(--t-body)", fontWeight: 600, textDecoration: "none",
              background: "var(--gold)", color: "var(--gold-ink)",
            }}
          >
            Find players
          </Link>
        </div>
      )}

      {requests.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", marginBottom: "var(--s3)" }}>
            <h2 className="section-label">Requests</h2>
            <span
              className="digits"
              style={{
                fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: "var(--r-full)",
                background: "var(--surface-2)", color: "var(--text-muted)",
              }}
            >
              {requests.length}
            </span>
          </div>
          <ListGroup>{requests.map(row)}</ListGroup>
          <p className="t-caption" style={{ marginTop: "var(--s2)" }}>
            People you don&apos;t follow get one message until you reply.
          </p>
        </section>
      )}
    </div>
  );
}
