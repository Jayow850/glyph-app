"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { subscribeWaiting } from "@/lib/notify";

/**
 * Line icons, drawn here rather than pulled from a package.
 * The nav previously used Unicode glyphs (⌂ ♟ ♜ ◉), which render in a
 * different font on every platform and are a large part of why the app
 * read as generic on a phone.
 */
const ICON = {
  home: <><path d="M3 10.8 12 3.5l9 7.3" /><path d="M5.6 9.4V19a1.4 1.4 0 0 0 1.4 1.4h10a1.4 1.4 0 0 0 1.4-1.4V9.4" /></>,
  games: <><path d="M4 3.6h3.1L19 15.5v3.1h-3.1L4 6.7z" /><path d="M20 3.6h-3.1L5 15.5v3.1h3.1L20 6.7z" /></>,
  play: <><circle cx="12" cy="7" r="3.1" /><path d="M9.4 10.2 7.6 17h8.8l-1.8-6.8" /><path d="M6 20.4h12" /></>,
  trophy: <><path d="M8 4h8v4.6a4 4 0 0 1-8 0z" /><path d="M8 5.4H5.4v1.3A3 3 0 0 0 8 9.6" /><path d="M16 5.4h2.6v1.3A3 3 0 0 1 16 9.6" /><path d="M10.4 12.8h3.2v3.4h-3.2z" /><path d="M8.4 20h7.2" /></>,
  clubs: <><path d="M6.6 4.6h2.2v2h2.1v-2h2.2v2h2.1v-2h2.2V8l-1.6 1.3v6.4L18.2 19H5.8l1.6-3.3V9.3L5.8 8z" /></>,
  profile: <><circle cx="12" cy="8.4" r="3.4" /><path d="M5.2 20c0-3.5 3-5.9 6.8-5.9s6.8 2.4 6.8 5.9" /></>,
  plus: <><path d="M12 5.5v13" /><path d="M5.5 12h13" /></>,
} as const;

type IconName = keyof typeof ICON;

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {ICON[name]}
    </svg>
  );
}

interface Item {
  href: string;
  icon: IconName;
  label: string;
}

/** Five targets, no more. Games is where the chess actually happens. */
const PRIMARY: Item[] = [
  { href: "/feed", icon: "home", label: "Home" },
  { href: "/challenges", icon: "games", label: "Games" },
  { href: "/clubs", icon: "clubs", label: "Clubs" },
  { href: "/profile", icon: "profile", label: "Profile" },
];

/** The desktop rail has room for everything. */
const RAIL: Item[] = [
  { href: "/feed", icon: "home", label: "Home" },
  { href: "/challenges", icon: "games", label: "Games" },
  { href: "/play", icon: "play", label: "Practice" },
  { href: "/tournaments", icon: "trophy", label: "Tournaments" },
  { href: "/clubs", icon: "clubs", label: "Clubs" },
  { href: "/profile", icon: "profile", label: "Profile" },
];

/**
 * How many challenges are sitting unanswered.
 *
 * A toast that times out must not take the challenge with it — it is
 * still pending, and this badge is what says so. The notification
 * layer already polls for them, so the nav listens rather than running
 * a second poll of its own.
 */
function useWaiting() {
  const [n, setN] = useState(0);
  useEffect(() => subscribeWaiting(setN), []);
  return n;
}

function useActive() {
  const pathname = usePathname() ?? "";
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const isActive = useActive();
  const waiting = useWaiting();

  return (
    <nav
      className="mobilenav navbar"
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40,
        background: "var(--overlay)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div
        className="shell"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          alignItems: "center",
          paddingTop: "var(--s2)",
          paddingBottom: "var(--s2)",
        }}
      >
        {PRIMARY.slice(0, 2).map((n) => (
          <NavTab
            key={n.href}
            item={n}
            active={isActive(n.href)}
            badge={n.href === "/challenges" ? waiting : 0}
          />
        ))}

        <Link
          href="/compose"
          aria-label="Publish"
          className="press"
          style={{
            width: 54, height: 54, borderRadius: "var(--r-full)",
            display: "grid", placeItems: "center", justifySelf: "center",
            background: "var(--gold)", color: "var(--gold-ink)",
            marginTop: -10,
            boxShadow: "0 8px 22px rgba(212,175,55,0.3)",
          }}
        >
          <Icon name="plus" size={26} />
        </Link>

        {PRIMARY.slice(2).map((n) => (
          <NavTab key={n.href} item={n} active={isActive(n.href)} />
        ))}
      </div>
    </nav>
  );
}

function NavTab({ item, active, badge = 0 }: { item: Item; active: boolean; badge?: number }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={badge > 0 ? `${item.label}, ${badge} waiting` : undefined}
      className="press tap"
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 3,
        color: active ? "var(--gold)" : "var(--text-muted)",
        transition: "color 160ms var(--ease)",
      }}
    >
      <span style={{ position: "relative", display: "block" }}>
        <Icon name={item.icon} size={21} />
        {badge > 0 && (
          <span
            className="digits"
            style={{
              position: "absolute", top: -5, right: -9, minWidth: 16, height: 16,
              padding: "0 4px", borderRadius: "var(--r-full)",
              background: "var(--gold)", color: "var(--gold-ink)",
              fontSize: 10, fontWeight: 700, lineHeight: "16px", textAlign: "center",
            }}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span style={{ fontSize: 11, fontWeight: active ? 600 : 500, letterSpacing: "0.01em" }}>
        {item.label}
      </span>
    </Link>
  );
}

export function SideRail() {
  const isActive = useActive();
  const waiting = useWaiting();

  return (
    <aside className="rail" style={{ paddingTop: "var(--s4)" }}>
      <div style={{ position: "sticky", top: 72, display: "flex", flexDirection: "column", gap: 2 }}>
        {RAIL.map((n) => {
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className="press"
              style={{
                display: "flex", alignItems: "center", gap: "var(--s3)",
                borderRadius: "var(--r-md)",
                padding: "var(--s3) var(--s4)",
                fontSize: "var(--t-body)",
                fontWeight: active ? 600 : 500,
                color: active ? "var(--gold)" : "var(--text-muted)",
                background: active ? "var(--gold-wash)" : "transparent",
                transition: "color 160ms var(--ease), background 160ms var(--ease)",
              }}
            >
              <Icon name={n.icon} size={20} />
              {n.label}
              {n.href === "/challenges" && waiting > 0 && (
                <span
                  className="digits"
                  style={{
                    marginLeft: "auto", minWidth: 20, padding: "1px 6px",
                    borderRadius: "var(--r-full)", textAlign: "center",
                    background: "var(--gold)", color: "var(--gold-ink)",
                    fontSize: 11, fontWeight: 700,
                  }}
                >
                  {waiting > 9 ? "9+" : waiting}
                </span>
              )}
            </Link>
          );
        })}

        <Link
          href="/compose"
          className="press"
          style={{
            marginTop: "var(--s3)", borderRadius: "var(--r-md)",
            padding: "var(--s3) var(--s4)", fontWeight: 600,
            fontSize: "var(--t-body)", textAlign: "center",
            background: "var(--gold)", color: "var(--gold-ink)",
          }}
        >
          Publish
        </Link>
      </div>
    </aside>
  );
}
