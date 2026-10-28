/**
 * One queue for everything the app needs to tell you.
 *
 * Before this, a challenge rendered its own fixed card, a rating change
 * used a toast, and nothing else told you anything — so notices
 * overlapped the header, each looked different, and two arriving at
 * once fought for the same corner. One bus, one layer, one visual
 * language, and a queue that decides what is on screen.
 *
 * Deliberately not React context: notices are raised from event
 * handlers, polls and route handlers' callers, and threading a provider
 * through every one of those is how this ends up reinvented locally
 * again.
 */

export type NoticeKind = "challenge" | "success" | "info" | "warn";

export interface NoticeAction {
  label: string;
  /** Return true to dismiss the notice. */
  run: () => void | Promise<unknown>;
  primary?: boolean;
}

export interface Notice {
  id: string;
  kind: NoticeKind;
  /** The line in bold — "Anna Kovacs challenges you". */
  title: string;
  /** Muted second line — "Rapid · 15+10 · rated". */
  detail?: string;
  /** A quoted message, shown in italics. */
  quote?: string | null;
  /** Who it is from, for the avatar and flag. */
  from?: { name: string; country?: string | null; title?: string | null; rating?: string | null };
  actions?: NoticeAction[];
  /** Milliseconds on screen. 0 keeps it until dismissed. */
  ttl: number;
  /** Notices sharing a key replace each other rather than stacking. */
  key?: string;
}

type Listener = (notices: Notice[]) => void;

/** At most two on screen; the rest wait their turn. */
const VISIBLE = 2;

let queue: Notice[] = [];
const listeners = new Set<Listener>();
let seq = 0;

function emit() {
  const shown = queue.slice(0, VISIBLE);
  listeners.forEach((fn) => fn(shown));
}

export function notify(notice: Omit<Notice, "id"> & { id?: string }): string {
  const id = notice.id ?? `n${++seq}`;
  const next: Notice = { ...notice, id };

  // A second draw offer should replace the first, not pile on top of it.
  if (next.key) queue = queue.filter((n) => n.key !== next.key);
  queue = [...queue, next];
  emit();
  return id;
}

export function dismiss(id: string) {
  const before = queue.length;
  queue = queue.filter((n) => n.id !== id);
  if (queue.length !== before) emit();
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn(queue.slice(0, VISIBLE));
  return () => { listeners.delete(fn); };
}

/* ------------------------------------------------------------------ *
 * The unread count behind the Games tab badge.
 *
 * A notice that times out is not lost — the challenge is still pending,
 * and the badge is what says so. The layer owns the poll, the nav just
 * listens, and neither has to know about the other.
 * ------------------------------------------------------------------ */

let waiting = 0;
const waitingListeners = new Set<(n: number) => void>();

export function setWaiting(n: number) {
  if (n === waiting) return;
  waiting = n;
  waitingListeners.forEach((fn) => fn(waiting));
}

export function subscribeWaiting(fn: (n: number) => void): () => void {
  waitingListeners.add(fn);
  fn(waiting);
  return () => { waitingListeners.delete(fn); };
}

/** A short tap, where the device offers one. Silent everywhere else. */
export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported, or blocked by the page's permissions */
  }
}
