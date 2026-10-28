"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/**
 * One tap to greet a newcomer.
 *
 * Optimistic, because the whole point is that greeting someone should
 * cost nothing. If the request fails the count rolls back rather than
 * silently lying — a welcome that did not reach the newcomer is worse
 * than a button that admits it failed.
 */
export function WelcomeButton({
  postId,
  count = 0,
  already = false,
  compact = false,
}: {
  postId: string;
  count?: number;
  already?: boolean;
  compact?: boolean;
}) {
  const [sent, setSent] = useState(already);
  const [n, setN] = useState(count);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function welcome() {
    if (sent || busy) return;
    setBusy(true);
    setSent(true);
    setN((v) => v + 1);
    try {
      const res = await fetch(`/api/posts/${postId}/welcome`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (typeof data.welcomes === "number") setN(data.welcomes);
      router.refresh();
    } catch {
      setSent(false);
      setN((v) => Math.max(0, v - 1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={welcome}
      disabled={sent || busy}
      className="press"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
        minHeight: compact ? 32 : 40,
        padding: compact ? "0 12px" : "0 16px",
        borderRadius: "var(--r-full)",
        fontSize: compact ? 13 : "var(--t-secondary)", fontWeight: 600,
        cursor: sent ? "default" : "pointer",
        background: sent ? "transparent" : "var(--gold)",
        color: sent ? "var(--text-muted)" : "var(--gold-ink)",
        border: sent ? "1px solid var(--border)" : "none",
      }}
    >
      {sent ? <Icon name="check" size={14} strokeWidth={2.5} /> : <Icon name="users" size={14} />}
      {sent ? "Welcomed" : "Welcome"}
      {n > 0 && <span className="digits" style={{ opacity: 0.75 }}>{n}</span>}
    </button>
  );
}
