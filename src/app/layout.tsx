import "./globals.css";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { NotifyLayer } from "@/components/notify/NotifyLayer";
import { BottomNav, SideRail } from "@/components/nav/Nav";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { THEME_SCRIPT } from "@/lib/theme";

/**
 * Fonts are self-hosted, not fetched from Google.
 *
 * The previous setup imported them over the network from
 * fonts.googleapis.com inside globals.css. That is render-blocking, and
 * in mainland China the host is unreachable — so headings silently fell
 * back to Georgia and body text to the system sans, which is most of
 * why production never looked like the demo on a phone.
 *
 * These two variable files live in the repo: 116 KB for the pair, no
 * third-party request at runtime or build time, and no country where
 * they fail to arrive.
 */
const display = localFont({
  src: "./fonts/fraunces-variable.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "400 700",
  style: "normal",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

const body = localFont({
  src: "./fonts/inter-variable.woff2",
  variable: "--font-body",
  display: "swap",
  weight: "400 700",
  style: "normal",
  fallback: ["-apple-system", "Segoe UI", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: "GLYPH — Where Chess People Live", template: "%s · GLYPH" },
  description: "Tournaments, ratings, and the home of chess people worldwide.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "GLYPH" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  // Two values so the browser chrome matches before any script runs;
  // an explicit choice updates this tag at runtime.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF8F4" },
    { media: "(prefers-color-scheme: dark)", color: "#0D0D0F" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const signedIn = Boolean((session?.user as { id?: string })?.id);

  return (
    <html lang="en" className={`${display.variable} ${body.variable} dark`} suppressHydrationWarning>
      <head>
        {/* Decides the theme before the first paint — see lib/theme.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <header
          className="appbar"
          style={{
            position: "sticky", top: 0, zIndex: 30,
            background: "var(--overlay)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            className="shell"
            style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            {/* The only Fraunces in the product. */}
            <Link href="/feed" className="wordmark press" style={{ fontSize: 23 }}>
              GLYPH<span style={{ color: "var(--gold)" }}>.</span>
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--s1)" }}>
            <ThemeToggle compact />
            <Link
              href="/messages"
              aria-label="Messages"
              className="tap press"
              style={{ display: "grid", placeItems: "center", color: "var(--text-muted)" }}
            >
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
                <path d="m3.8 7 7.1 5.2a2 2 0 0 0 2.2 0L20.2 7" />
              </svg>
            </Link>
            </div>
          </div>
        </header>

        {/* Anything that needs to interrupt you, anywhere in the app,
            renders here — below the header, never over it. */}
        {signedIn && <NotifyLayer />}

        <div className="layout">
          <SideRail />

          <main className="shell page-bottom" style={{ minHeight: "calc(100vh - 56px)" }}>
            {children}
          </main>

          <aside className="rail" style={{ paddingTop: "var(--s4)" }}>
            <div className="card" style={{ position: "sticky", top: 72 }}>
              <p className="section-label" style={{ marginBottom: "var(--s2)" }}>Move of the day</p>
              <p className="t-secondary">Solve today&apos;s puzzle to keep the flame.</p>
            </div>
          </aside>
        </div>

        <BottomNav />
      </body>
    </html>
  );
}
