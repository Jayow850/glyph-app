import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { ChallengeWatcher } from "@/components/ChallengeWatcher";

export const metadata: Metadata = {
  title: { default: "GLYPH — Where Chess People Live", template: "%s · GLYPH" },
  description: "Tournaments, ratings, and the home of chess people worldwide.",
  manifest: "/manifest.json",
};
export const viewport: Viewport = {
  themeColor: "#0D0D0F",
  width: "device-width",
  initialScale: 1,
};

type NavItem = {
  href: string;
  icon?: string;
  label?: string;
  fab?: boolean;
  /** Desktop rail only — the mobile bar stays at five targets. */
  railOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: "/feed", icon: "⌂", label: "Home" },
  { href: "/play", icon: "♟", label: "Play" },
  { href: "/tournaments", icon: "♛", label: "Tournaments", railOnly: true },
  { href: "/challenges", icon: "⚔", label: "Challenges", railOnly: true },
  { href: "/compose", fab: true },
  { href: "/clubs", icon: "♜", label: "Clubs" },
  { href: "/profile", icon: "◉", label: "Profile" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const signedIn = Boolean((session?.user as { id?: string })?.id);

  return (
    <html lang="en" className="dark">
      <body>
        {/* §5 — header locked at 56px, inner content on the shared shell edges */}
        <header
          className="sticky top-0 z-20"
          style={{ height: 56, background: "rgba(13,13,15,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(212,175,55,0.08)" }}
        >
          <div className="shell" style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Link href="/feed" className="font-display" style={{ fontSize: 22 }}>
              GLYPH<span className="text-gold">.</span>
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Link href="/messages" className="text-ivory-meta" style={{ fontSize: 18, minWidth: 44, minHeight: 44, display: "grid", placeItems: "center" }}>✉</Link>
            </div>
          </div>
        </header>

        {/* Challenges can arrive while you are anywhere in the app. */}
        {signedIn && <ChallengeWatcher />}

        {/* §1 — mobile: locked single column; desktop: centered 3-column grid */}
        <div className="layout">
          <aside className="rail" style={{ paddingTop: 16 }}>
            <div style={{ position: "sticky", top: 72, display: "flex", flexDirection: "column", gap: 8 }}>
              {NAV.filter((n) => !n.fab).map((n) => (
                <Link key={n.href} href={n.href} className="text-ivory-meta"
                  style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 12, padding: "12px 16px", fontSize: 15, fontWeight: 500 }}>
                  <span style={{ fontSize: 18 }}>{n.icon}</span>{n.label}
                </Link>
              ))}
              <Link href="/compose" className="bg-gold text-night"
                style={{ marginTop: 8, borderRadius: 12, padding: "12px 16px", fontWeight: 600, fontSize: 15, textAlign: "center" }}>
                ♟ Publish
              </Link>
            </div>
          </aside>

          <main className="shell" style={{ paddingBottom: 112, minHeight: "calc(100vh - 56px)" }}>{children}</main>

          <aside className="rail" style={{ paddingTop: 16 }}>
            <div className="card" style={{ position: "sticky", top: 72 }}>
              <p className="section-label" style={{ marginBottom: 8 }}>Move of the day</p>
              <p style={{ fontSize: 13 }} className="text-ivory-meta">Solve today&apos;s puzzle to keep the flame. 🔥</p>
            </div>
          </aside>
        </div>

        {/* §5 — bottom nav: mobile only, same shell edges, FAB raised 8px */}
        <nav
          className="mobilenav fixed bottom-0 left-0 right-0 z-20"
          style={{ background: "rgba(13,13,15,0.94)", backdropFilter: "blur(8px)", borderTop: "1px solid rgba(212,175,55,0.08)" }}
        >
          <div className="shell" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, paddingBottom: 8 }}>
            {NAV.filter((n) => !n.railOnly).map((n) =>
              n.fab ? (
                <Link key={n.href} href={n.href}
                  className="bg-gold text-night"
                  style={{ width: 56, height: 56, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 26, marginTop: -8, boxShadow: "0 8px 24px rgba(212,175,55,0.35)", flexShrink: 0 }}>
                  ♟
                </Link>
              ) : (
                <Link key={n.href} href={n.href} className="text-ivory-meta"
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 44, minHeight: 44, justifyContent: "center" }}>
                  <span style={{ fontSize: 19, lineHeight: 1 }}>{n.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 500 }}>{n.label}</span>
                </Link>
              )
            )}
          </div>
        </nav>
      </body>
    </html>
  );
}
