"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/ui/Sheet";
import { Icon } from "@/components/ui/Icon";

/**
 * The way into a conversation.
 *
 * Without this the whole DM feature is unreachable: the gating, the
 * requests, the threads and the inbox all existed with no button
 * anywhere that opens one.
 *
 * It asks for the first message in a sheet rather than dropping you
 * into an empty thread, because the first message to someone who does
 * not follow you is the ONLY one you get until they accept — and a
 * blank composer gives no hint of that. Here the rule is on screen
 * while you write it.
 */
export function MessageButton({ handle, name }: { handle: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function send() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dms/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toHandle: handle, body: text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "That didn't send.");
        return;
      }
      const data = await res.json();
      setOpen(false);
      router.push(`/messages/${data.room.id}`);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Message ${name}`}
        className="press"
        style={{
          flexShrink: 0, width: 40, height: 40, borderRadius: "var(--r-md)",
          display: "grid", placeItems: "center", cursor: "pointer",
          background: "transparent", border: "1px solid var(--border)",
          color: "var(--text-muted)",
        }}
      >
        <Icon name="chat" size={18} />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`Message ${name}`}
        subtitle="If they don't follow you, this is the only message you can send until they accept."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s3)", paddingBottom: "var(--s4)" }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Say something"
            rows={4}
            maxLength={2000}
            autoFocus
            style={{
              width: "100%", boxSizing: "border-box", resize: "none",
              background: "var(--surface-2)", color: "var(--text)",
              border: "1px solid var(--border)", borderRadius: "var(--r-md)",
              padding: "var(--s3)", fontSize: "var(--t-body)",
              fontFamily: "inherit", lineHeight: 1.45, outline: "none",
            }}
          />

          {error && <p style={{ color: "var(--danger)", fontSize: "var(--t-caption)" }}>{error}</p>}

          <button
            onClick={send}
            disabled={busy || body.trim().length === 0}
            className="press"
            style={{
              minHeight: 48, borderRadius: "var(--r-md)", border: "none",
              fontSize: "var(--t-body)", fontWeight: 600,
              background: "var(--gold)", color: "var(--gold-ink)",
              cursor: busy ? "default" : "pointer",
              opacity: body.trim().length === 0 ? 0.45 : busy ? 0.6 : 1,
            }}
          >
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </Sheet>
    </>
  );
}
