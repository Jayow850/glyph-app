"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Home", glyph: "♔" },
  { href: "/tournaments", label: "Play", glyph: "♞" },
  { href: "/messages", label: "Chat", glyph: "♝" },
  { href: "/events", label: "Events", glyph: "♜" },
  { href: "/profile", label: "Profile", glyph: "♟" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-board-line bg-board/95 backdrop-blur md:hidden">
      <ul className="flex justify-around">
        {TABS.map((t) => {
          const active = path?.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 text-xs ${
                  active ? "text-felt-bright" : "text-ivory-dim"
                }`}
              >
                <span className="text-xl leading-none">{t.glyph}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
