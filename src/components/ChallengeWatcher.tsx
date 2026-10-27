"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { playChallenge, playNotify } from "@/lib/sound";

interface Incoming {
  id: string;
  name: string;
  handle: string;
  clock: string;
  speed: string;
  rated: boolean;
  message: string | null;
}

/**
 * Lives in the root layout and watches for two things from anywhere in
 * the app: a challenge arriving, and a challenge you sent being
 * accepted. The second one jumps you straight to the board — the player
 * who sent the invitation should never be the last to find out the game
 * has started.
 */
export function ChallengeWatcher() {
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const rung = useRef<Set<string>>(new Set());
  const jumped = useRef<Set<string>>(new Set());
  const dismissed = useRef<Set<string>>(new Set());

  const router = useRouter();
  const pathname = usePathname();

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/challenges/pulse", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();

      // A challenge you sent was accepted — go and play it.
      for (const s of (data.started ?? []) as { gameId: string }[]) {
        if (!s.gameId || jumped.current.has(s.gameId)) continue;
        jumped.current.add(s.gameId);
        playNotify();
        router.push(`/game/${s.gameId}`);
        return;
      }

      const list = ((data.incoming ?? []) as Incoming[]).filter((c) => !dismissed.current.has(c.id));

      // Ring once per challenge, not once per poll.
      const fresh = list.filter((c) => !rung.current.has(c.id));
      if (fresh.length > 0) {
        fresh.forEach((c) => rung.current.add(c.id));
        playChallenge();
      }

      setIncoming(list);
    } catch {
      /* a missed beat is harmless; the next one catches up */
    }
  }, [router]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [poll]);

  async function accept(id: string) {
    setBusy(id);
    dismissed.current.add(id);
    setIncoming((list) => list.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/challenges/${id}/accept`, { method: "POST" });
      if (res.ok) {
        const { gameId } = await res.json();
        jumped.current.add(gameId);
        router.push(`/game/${gameId}`);
      }
    } catch {
      /* the challenges page remains the fallback */
    } finally {
      setBusy(null);
    }
  }

  async function decline(id: string) {
    setBusy(id);
    dismissed.current.add(id);
    setIncoming((list) => list.filter((c) => c.id !== id));
    try {
      await fetch(`/api/challenges/${id}/decline`, { method: "POST" });
      router.refresh();
    } catch {
      /* best effort */
    } finally {
      setBusy(null);
    }
  }

  // The challenges page already lists these in full; no need to stack
  // a floating copy on top of it. The sound and the redirect still run.
  if (pathname === "/challenges" || incoming.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 68,
        right: 16,
        left: "auto",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: "min(340px, calc(100vw - 32px))",
      }}
    >
      {incoming.map((c) => (
        <div
          key={c.id}
          className="cascade"
          style={{
            background: "#16161A",
            border: "1px solid rgba(212,175,55,0.3)",
            borderRadius: 14,
            padding: 14,
            boxShadow: "0 18px 50px rgba(0,0,0,0.6)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div>
            <p style={{ fontSize: 15, fontWeight: 600 }}>{c.name} challenges you</p>
            <p className="text-ivory-meta digits" style={{ fontSize: 12 }}>
              {c.speed} · {c.clock} · {c.rated ? "rated" : "casual"}
            </p>
            {c.message && (
              <p style={{ fontSize: 14, color: "#B5B5BE", marginTop: 5, fontStyle: "italic" }}>
                “{c.message}”
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => accept(c.id)}
              disabled={busy === c.id}
              style={{
                flex: 1, background: "#D4AF37", color: "#0D0D0F", border: "none",
                borderRadius: 10, padding: "9px 0", fontSize: 14, fontWeight: 600,
                cursor: "pointer", opacity: busy === c.id ? 0.5 : 1,
              }}
            >
              Accept
            </button>
            <button
              onClick={() => decline(c.id)}
              disabled={busy === c.id}
              style={{
                flex: 1, background: "#1C1C21", color: "#8A8A93",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10, padding: "9px 0", fontSize: 14,
                cursor: "pointer", opacity: busy === c.id ? 0.5 : 1,
              }}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
