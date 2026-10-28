export type ThemeChoice = "system" | "light" | "dark";
export type Resolved = "light" | "dark";

export const THEME_KEY = "glyph-theme";

/**
 * The script that runs before the first paint.
 *
 * Theme cannot be decided in React: by the time a component mounts the
 * browser has already painted, and the user sees a dark flash before a
 * light page (or the reverse). So this runs synchronously in <head>,
 * reads the saved choice, and puts the answer on <html> before anything
 * is drawn. It is deliberately tiny and dependency-free, and it must
 * never throw — localStorage is unavailable in a private window and in
 * some embedded webviews, and a thrown error here would blank the page.
 *
 * Kept as a string because it has to be inlined, not bundled.
 */
export const THEME_SCRIPT = `(function(){try{
var c=localStorage.getItem("${THEME_KEY}")||"system";
var d=c==="dark"||(c==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
var r=document.documentElement;
r.setAttribute("data-theme",d?"dark":"light");
r.classList.toggle("dark",d);
}catch(e){}})();`;

/** What a choice means right now, given the OS setting. */
export function resolve(choice: ThemeChoice): Resolved {
  if (choice !== "system") return choice;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Paint the answer onto the document. Safe to call on every change. */
export function apply(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const dark = resolve(choice) === "dark";
  const root = document.documentElement;
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.classList.toggle("dark", dark);

  // The browser chrome — address bar, status bar, task switcher — is part
  // of the page on a phone. Leaving it dark behind a light app is the
  // detail that makes a theme switch feel half-done.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0D0D0F" : "#FAF8F4");
}

export function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* private window, or site data blocked */
  }
  return "system";
}

export function write(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* the choice still applies for this session */
  }
}
