"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

interface Msg {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  sender?: { profile?: { fullName?: string | null } | null };
}

/**
 * One conversation.
 *
 * Polled rather than socketed. There is a Socket.io server in the repo
 * and wiring this to it is the right end state, but a thread that
 * works everywhere today beats one that depends on a process nobody
 * has deployed yet — and the swap is confined to this component.
 */
export function Thread({
  roomId,
  youId,
  pending,
  youOpened,
}: {
  roomId: string;
  youId: string;
  /** A request they have not accepted yet. */
  pending: boolean;
  /** True when the pending request is yours, so you are the one waiting. */
  youOpened: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/messages`, { cache: "no-store" });
      if (!res.ok) return;
      const data: Msg[] = await res.json();
      // The API answers newest first, which is right for paging and
      // wrong for reading.
      setMessages([...data].reverse());
    } catch {
      /* the next poll catches up */
    }
  }, [roomId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    setDraft("");
    try {
      const res = await fetch(`/api/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.ok) {
        await load();
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "That didn't send.");
        setDraft(body);
      }
    } catch {
      setError("Could not reach the server.");
      setDraft(body);
    } finally {
      setSending(false);
    }
  }

  // You may not keep writing into a request nobody has answered.
  const locked = pending && youOpened && messages.some((m) => m.senderId === youId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s3)", minHeight: 0, flex: 1 }}>
      <div
        ref={scroller}
        style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          display: "flex", flexDirection: "column", gap: "var(--s2)",
          paddingBottom: "var(--s2)",
        }}
      >
        {messages.length === 0 && (
          <p className="t-secondary" style={{ textAlign: "center", padding: "var(--s8) 0" }}>
            Nothing here yet.
          </p>
        )}

        {messages.map((m) => {
          const mine = m.senderId === youId;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
              <div
                style={{
                  maxWidth: "80%",
                  padding: "var(--s2) var(--s3)",
                  borderRadius: "var(--r-md)",
                  background: mine ? "var(--gold-wash)" : "var(--surface-2)",
                  border: `1px solid ${mine ? "var(--border-gold)" : "var(--border)"}`,
                }}
              >
                <p style={{ fontSize: "var(--t-body)", lineHeight: 1.45, wordBreak: "break-word" }}>
                  {m.body}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: "var(--t-caption)" }}>{error}</p>}

      {locked ? (
        <p className="t-caption" style={{ textAlign: "center", padding: "var(--s3)" }}>
          Waiting for them to accept. One message until they do.
        </p>
      ) : (
        <div style={{ display: "flex", gap: "var(--s2)", paddingBottom: "var(--s2)" }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder="Message"
            maxLength={2000}
            style={{
              flex: 1, minHeight: 44, boxSizing: "border-box",
              background: "var(--surface-2)", color: "var(--text)",
              border: "1px solid var(--border)", borderRadius: "var(--r-full)",
              padding: "0 var(--s4)", fontSize: "var(--t-body)", outline: "none",
            }}
          />
          <button
            onClick={send}
            disabled={sending || draft.trim().length === 0}
            aria-label="Send"
            className="press"
            style={{
              width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
              display: "grid", placeItems: "center", border: "none",
              background: "var(--gold)", color: "var(--gold-ink)",
              cursor: sending ? "default" : "pointer",
              opacity: draft.trim().length === 0 ? 0.45 : 1,
            }}
          >
            <Icon name="send" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
