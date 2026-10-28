"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Flag } from "@/components/ui/Flag";
import {
  subscribe, notify, dismiss, setWaiting, haptic,
  type Notice, type NoticeAction,
} from "@/lib/notify";
import { playChallenge, playNotify } from "@/lib/sound";

interface PulseChallenge {
  id: string;
  name: string;
  handle: string;
  country: string | null;
  title: string | null;
  rating: string;
  clock: string;
  speed: string;
  rated: boolean;
  message: string | null;
  secondsLeft: number;
}

function Card({ notice, compact, onGo }: { notice: Notice; compact: boolean; onGo: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const from = notice.from;

  async function run(action: NoticeAction) {
    setBusy(true);
    try {
      await action.run();
    } finally {
      onGo(notice.id);
    }
  }

  const edge =
    notice.kind === "challenge" ? "var(--gold)"
    : notice.kind === "warn" ? "var(--danger)"
    : notice.kind === "success" ? "var(--success)"
    : "var(--border)";

  return (
    <div
      className="cascade"
      style={{
        position: "relative",
        background: "var(--surface)",
        border: `1px solid ${edge}`,
        borderRadius: compact ? "var(--r-md)" : "var(--r-lg)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: "var(--s3)",
          padding: compact ? "var(--s2) var(--s3)" : "var(--s3) var(--s4)",
        }}
      >
        {from && !compact && <Avatar name={from.name} size={38} />}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span
              style={{
                fontSize: compact ? 13 : 15, fontWeight: 600,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {notice.title}
            </span>
            {from?.country && <Flag code={from.country} height={11} />}
          </div>

          {notice.detail && (
            <p className="t-caption digits" style={{ color: "var(--text-muted)" }}>{notice.detail}</p>
          )}
          {notice.quote && !compact && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic", marginTop: 3 }}>
              “{notice.quote}”
            </p>
          )}
        </div>

        {notice.actions && (
          <div style={{ display: "flex", gap: "var(--s2)", flexShrink: 0 }}>
            {notice.actions.map((a) => (
              <button
                key={a.label}
                onClick={() => run(a)}
                disabled={busy}
                className="press"
                style={{
                  borderRadius: 10, cursor: busy ? "default" : "pointer",
                  padding: compact ? "6px 12px" : "9px 15px",
                  fontSize: compact ? 13 : 14, fontWeight: 600,
                  background: a.primary ? "var(--gold)" : "var(--surface-2)",
                  color: a.primary ? "var(--gold-ink)" : "var(--text-muted)",
                  border: a.primary ? "none" : "1px solid var(--border)",
                  opacity: busy ? 0.5 : 1,
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* The time you have left to answer, draining along the edge. */}
      {notice.ttl > 0 && (
        <span
          style={{
            position: "absolute", left: 0, bottom: 0, height: 2, width: "100%",
            background: edge, transformOrigin: "left center",
            animation: `notify-drain ${notice.ttl}ms linear both`,
          }}
        />
      )}
    </div>
  );
}

/**
 * The one place anything in GLYPH interrupts you.
 *
 * It sits below the header rather than over it — the old challenge card
 * was anchored to the viewport top and clipped the wordmark — and it
 * knows when you are at a board: mid-game a notice becomes a slim
 * banner, because nothing may cover the pieces or eat a tap while your
 * clock is running.
 */
export function NotifyLayer() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const inGame = pathname?.startsWith("/game/") ?? false;

  const rung = useRef<Set<string>>(new Set());
  const jumped = useRef<Set<string>>(new Set());
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => subscribe(setNotices), []);

  // Each notice retires on its own clock; a stack of them does not
  // share one timer, or the second would inherit the first's remainder.
  useEffect(() => {
    const timers = notices
      .filter((n) => n.ttl > 0)
      .map((n) => setTimeout(() => dismiss(n.id), n.ttl));
    return () => timers.forEach(clearTimeout);
  }, [notices]);

  const accept = useCallback(async (id: string) => {
    handled.current.add(id);
    const res = await fetch(`/api/challenges/${id}/accept`, { method: "POST" });
    if (!res.ok) return;
    const { gameId } = await res.json();
    jumped.current.add(gameId);
    router.push(`/game/${gameId}`);
  }, [router]);

  const decline = useCallback(async (id: string) => {
    handled.current.add(id);
    await fetch(`/api/challenges/${id}/decline`, { method: "POST" });
    router.refresh();
  }, [router]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/challenges/pulse", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();

      // A challenge you sent was accepted — go and play it. The player
      // who sent the invitation should never be the last to know.
      for (const s of (data.started ?? []) as { gameId: string }[]) {
        if (!s.gameId || jumped.current.has(s.gameId)) continue;
        jumped.current.add(s.gameId);
        playNotify();
        haptic();
        router.push(`/game/${s.gameId}`);
        return;
      }

      const incoming = ((data.incoming ?? []) as PulseChallenge[])
        .filter((c) => !handled.current.has(c.id));

      setWaiting(incoming.length);

      for (const c of incoming) {
        if (rung.current.has(c.id)) continue;
        rung.current.add(c.id);
        playChallenge();
        haptic(18);

        notify({
          id: c.id,
          key: `challenge:${c.id}`,
          kind: "challenge",
          title: `${c.name} challenges you`,
          detail: `${c.speed} · ${c.clock} · ${c.rated ? "rated" : "casual"}${c.rating ? ` · ${c.rating}` : ""}`,
          quote: c.message,
          from: { name: c.name, country: c.country, title: c.title, rating: c.rating },
          // Eight seconds here, or whatever is left of the challenge if
          // that is sooner. When it goes it is not lost: it is still
          // pending, and the Games badge says so.
          ttl: Math.max(3000, Math.min(8000, c.secondsLeft * 1000)),
          actions: [
            { label: "Accept", primary: true, run: () => accept(c.id) },
            { label: "Decline", run: () => decline(c.id) },
          ],
        });
      }
    } catch {
      /* a missed beat is harmless; the next one catches up */
    }
  }, [router, accept, decline]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [poll]);

  // The Games page lists these in full — a floating copy on top of the
  // list it duplicates is noise. The sound and the redirect still run.
  const silent = pathname === "/challenges";
  if (silent || notices.length === 0) return null;

  return (
    <div className="notify-layer" aria-live="polite">
      {notices.map((n) => (
        <Card key={n.id} notice={n} compact={inGame} onGo={dismiss} />
      ))}
    </div>
  );
}
