"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * A message request, waiting on you.
 *
 * Accepting is a real decision, so it is shown as one rather than
 * being implied by replying — and declining is simply walking away,
 * which is why there is no Decline button here. A stranger already
 * cannot send a second message, so the thread costs you nothing by
 * sitting there, and a Decline that notifies them would be worse for
 * the person declining than silence is.
 */
export function AcceptRequest({ roomId, name }: { roomId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function accept() {
    setBusy(true);
    try {
      const res = await fetch(`/api/dms/${roomId}/accept`, { method: "POST" });
      if (res.ok) router.refresh();
    } catch {
      /* the button simply re-enables */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: "var(--s3)",
        padding: "var(--s3) var(--s4)", borderRadius: "var(--r-md)",
        background: "var(--surface-2)", border: "1px solid var(--border)",
      }}
    >
      <p className="t-rowmeta" style={{ flex: 1 }}>
        {name} isn&apos;t someone you follow. Accept to reply.
      </p>
      <button
        onClick={accept}
        disabled={busy}
        className="press"
        style={{
          flexShrink: 0, border: "none", borderRadius: "var(--r-md)",
          padding: "9px 16px", fontSize: "var(--t-secondary)", fontWeight: 600,
          background: "var(--gold)", color: "var(--gold-ink)",
          cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
        }}
      >
        Accept
      </button>
    </div>
  );
}
