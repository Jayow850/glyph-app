"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Msg {
  id: string;
  userId: string;
  name: string;
  body: string;
  kind: string;
  at: string;
}

/**
 * Canned lines, the way both big sites do it. Most players never type
 * during a game — they want to say the four things chess players say,
 * in one tap, without taking their eyes off the clock.
 */
const OPENERS = ["Good luck!", "Have fun!", "You too!", "Let's go"];
const CLOSERS = ["Good game", "Well played", "Thanks!", "Rematch?"];
const REACTIONS = ["👍", "😅", "😮", "🫡", "🔥", "♟"];

export function GameChat({
  gameId,
  youId,
  canWrite,
  finished,
}: {
  gameId: string;
  youId: string | null;
  canWrite: boolean;
  finished: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}/chat`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {
      /* the next poll will catch up */
    }
  }, [gameId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send(body: string, kind: "CHAT" | "QUICK") {
    const text = body.trim();
    if (!text || sending || !canWrite) return;
    setSending(true);

    // Show it immediately — a chat that waits for a round trip feels broken.
    const optimistic: Msg = {
      id: `local-${Date.now()}`,
      userId: youId ?? "me",
      name: "You",
      body: text,
      kind,
      at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setDraft("");

    try {
      const res = await fetch(`/api/games/${gameId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, kind }),
      });
      if (res.ok) await load();
      else setMessages((m) => m.filter((x) => x.id !== optimistic.id));
    } catch {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  const quick = finished ? CLOSERS : OPENERS;

  return (
    <section className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <p className="section-label" style={{ padding: "14px 18px 8px" }}>Chat</p>

      <div
        ref={scroller}
        style={{
          maxHeight: 190,
          minHeight: 64,
          overflowY: "auto",
          padding: "0 18px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 7,
        }}
      >
        {messages.length === 0 ? (
          <p className="text-ivory-meta" style={{ fontSize: 14 }}>
            {canWrite ? "Say good luck." : "Nothing said yet."}
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.userId === youId;
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                <div
                  style={{
                    maxWidth: "82%",
                    background: mine ? "rgba(212,175,55,0.16)" : "var(--surface-2)",
                    border: `1px solid ${mine ? "rgba(212,175,55,0.22)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: 12,
                    padding: "7px 11px",
                  }}
                >
                  {!mine && (
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{m.name}</p>
                  )}
                  <p style={{ fontSize: 14, lineHeight: 1.4, wordBreak: "break-word" }}>{m.body}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {canWrite && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {quick.map((q) => (
              <button
                key={q}
                onClick={() => send(q, "QUICK")}
                disabled={sending}
                style={{
                  background: "var(--surface-2)", border: "1px solid rgba(255,255,255,0.08)",
                  color: "var(--text-muted)", borderRadius: 999, padding: "5px 11px",
                  fontSize: 13, cursor: "pointer",
                }}
              >
                {q}
              </button>
            ))}
            {REACTIONS.map((r) => (
              <button
                key={r}
                onClick={() => send(r, "QUICK")}
                disabled={sending}
                aria-label={`Send ${r}`}
                style={{
                  background: "var(--surface-2)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 999, width: 30, height: 30, fontSize: 15,
                  cursor: "pointer", lineHeight: 1,
                }}
              >
                {r}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(draft, "CHAT"); }}
            style={{ display: "flex", gap: 8 }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={300}
              placeholder="Message your opponent"
              style={{
                flex: 1, minWidth: 0, background: "var(--surface-2)", color: "var(--text)",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
                padding: "9px 12px", fontSize: 14, outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              style={{
                background: "var(--gold)", color: "var(--gold-ink)", border: "none",
                borderRadius: 10, padding: "0 16px", fontWeight: 600, fontSize: 14,
                cursor: "pointer", opacity: sending || !draft.trim() ? 0.4 : 1,
              }}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
