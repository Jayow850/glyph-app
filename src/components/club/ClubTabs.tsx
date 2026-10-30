"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const TABS = [
  ["", "Now"],
  ["season", "Season"],
  ["play", "Play"],
  ["honours", "Honours"],
  ["members", "Members"],
] as const;

/**
 * The club's five tabs.
 *
 * Real routes rather than client state, so every tab is a URL somebody
 * can send to a member — /club/lagos-kings/season is the table, which
 * is the link that actually gets pasted into a club WhatsApp group.
 *
 * Scroll position is remembered per tab for the life of the session:
 * leaving the table half-read to check the ladder and coming back to
 * the top of the page is the thing that makes tabs feel worse than the
 * long scroll they replaced.
 */
export function ClubTabs({
  slug,
  badges,
}: {
  slug: string;
  badges: { now: number; season: number; play: number };
}) {
  const pathname = usePathname();
  const base = `/club/${slug}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, "") : "";
  const segment = rest.split("/")[0] ?? "";

  // A roll of honour and a tournament live under the club but are not
  // tabs; light the tab they belong to rather than none at all.
  const active =
    segment === "trophies" ? "honours" : segment === "tournaments" ? "play" : segment;

  const barRef = useRef<HTMLDivElement>(null);

  // Remember where each tab was left, and restore on return.
  useEffect(() => {
    const key = `club:${slug}:${active}:scroll`;
    let saved = 0;
    try {
      saved = Number(sessionStorage.getItem(key) ?? 0);
    } catch {
      saved = 0;
    }
    if (saved > 0) window.scrollTo(0, saved);

    const onScroll = () => {
      try {
        sessionStorage.setItem(key, String(window.scrollY));
      } catch {
        /* private mode, or storage blocked — scrolling still works */
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [slug, active]);

  // Keep the open tab in view on a narrow screen.
  useEffect(() => {
    const el = barRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [active]);

  const countFor = (href: string) =>
    href === "" ? badges.now : href === "season" ? badges.season : href === "play" ? badges.play : 0;

  return (
    <div
      ref={barRef}
      role="tablist"
      aria-label="Club sections"
      style={{
        display: "flex",
        gap: "var(--s1)",
        overflowX: "auto",
        scrollbarWidth: "none",
        borderBottom: "1px solid var(--border)",
        // Full-bleed under a page gutter, so the underline reaches the
        // screen edge the way a tab bar should.
        marginInline: "calc(var(--s4) * -1)",
        paddingInline: "var(--s4)",
      }}
    >
      {TABS.map(([href, label]) => {
        const isActive = active === href;
        const count = countFor(href);
        return (
          <Link
            key={href}
            href={href ? `${base}/${href}` : base}
            role="tab"
            aria-selected={isActive}
            data-active={isActive}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "0 var(--s3)", minHeight: 44, flexShrink: 0,
              textDecoration: "none", whiteSpace: "nowrap",
              fontSize: "var(--t-secondary)",
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "var(--text)" : "var(--text-muted)",
              borderBottom: `2px solid ${isActive ? "var(--gold)" : "transparent"}`,
              marginBottom: -1,
            }}
          >
            {label}
            {count > 0 && (
              <span
                aria-label={`${count} needing attention`}
                className="digits"
                style={{
                  minWidth: 18, height: 18, padding: "0 5px", borderRadius: "var(--r-full)",
                  display: "inline-grid", placeItems: "center", fontSize: 11, fontWeight: 700,
                  background: "var(--gold)", color: "var(--gold-ink)",
                }}
              >
                {count > 9 ? "9+" : count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
