import Link from "next/link";
import { auth } from "@/lib/auth";
import { forYou, following, clubsFeed } from "@/lib/services/feed";
import { PostCard, type PostDto } from "@/components/social/PostCard";
import { Avatar } from "@/components/ui/Avatar";
import { Icon, type IconName } from "@/components/ui/Icon";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

type Tab = "for-you" | "following" | "club";

const TABS: { id: Tab; label: string }[] = [
  { id: "for-you", label: "For you" },
  { id: "following", label: "Following" },
  { id: "club", label: "Club" },
];

/**
 * Each tab needs its own empty state. "No posts" three times over tells
 * a member nothing about which lever to pull, and the levers are
 * different: follow someone, join a club, or be the first to post.
 */
const EMPTY: Record<Tab, { icon: IconName; line: string; cta: string; href: string }> = {
  "for-you": {
    icon: "castle",
    line: "Nothing from the last few days.",
    cta: "Share a game",
    href: "/compose",
  },
  following: {
    icon: "users",
    line: "You are not following anyone yet.",
    cta: "Find players",
    href: "/challenges",
  },
  club: {
    // The shared Icon set calls the club glyph "castle"; "clubs" only
    // exists inside the nav's own private set.
    icon: "castle",
    line: "Your clubs have been quiet.",
    cta: "Post to your club",
    href: "/compose",
  },
};

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: raw } = await searchParams;
  const tab: Tab = raw === "following" || raw === "club" ? raw : "for-you";

  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;

  const [posts, me] = await Promise.all([
    (async () => {
      if (!userId || tab === "for-you") return forYou();
      return tab === "following" ? following(userId) : clubsFeed(userId);
    })(),
    userId
      ? prisma.profile.findUnique({ where: { userId }, select: { fullName: true, handle: true } })
      : Promise.resolve(null),
  ]);

  const list = posts as unknown as PostDto[];
  const empty = EMPTY[tab];

  return (
    <div className="page-bottom" style={{ display: "flex", flexDirection: "column", gap: "var(--s4)", paddingTop: "var(--s3)" }}>
      {/* Where you are, and what else you could be looking at. The feed
          service has had three of these since the beginning and the
          page only ever rendered one of them. */}
      <nav style={{ display: "flex", gap: "var(--s1)", borderBottom: "1px solid var(--border)" }}>
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <Link
              key={t.id}
              href={t.id === "for-you" ? "/feed" : `/feed?tab=${t.id}`}
              scroll={false}
              style={{
                flex: 1, textAlign: "center", textDecoration: "none",
                padding: "var(--s3) var(--s2)",
                fontSize: "var(--t-secondary)", fontWeight: 600,
                color: on ? "var(--text)" : "var(--text-muted)",
                borderBottom: `2px solid ${on ? "var(--gold)" : "transparent"}`,
                marginBottom: -1,
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* A feed with no way to post from it is a reader, not a club. */}
      {me && (
        <Link
          href="/compose"
          className="press"
          style={{
            display: "flex", alignItems: "center", gap: "var(--s3)",
            padding: "var(--s3) var(--s4)", textDecoration: "none",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--r-full)", color: "var(--text-muted)",
          }}
        >
          <Avatar name={me.fullName ?? me.handle ?? "You"} size={30} />
          <span className="t-rowmeta" style={{ flex: 1 }}>Share a game, a position, a thought…</span>
          <Icon name="plus" size={18} />
        </Link>
      )}

      {list.length === 0 ? (
        <div
          style={{
            textAlign: "center", padding: "var(--s10) var(--s4)",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
          }}
        >
          <span style={{ color: "var(--text-dim)", display: "inline-block", marginBottom: "var(--s2)" }}>
            <Icon name={empty.icon} size={30} />
          </span>
          <p style={{ fontWeight: 600 }}>{empty.line}</p>
          <Link
            href={empty.href}
            className="press"
            style={{
              display: "inline-block", marginTop: "var(--s4)",
              borderRadius: "var(--r-md)", padding: "var(--s3) var(--s5)",
              fontSize: "var(--t-body)", fontWeight: 600, textDecoration: "none",
              background: "var(--gold)", color: "var(--gold-ink)",
            }}
          >
            {empty.cta}
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}>
          {list.map((p) => <PostCard key={p.id} post={p} />)}
        </div>
      )}
    </div>
  );
}
