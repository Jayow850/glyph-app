"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Follow toggle. Optimistic — the label flips immediately and rolls
 * back if the server disagrees, because a follow that takes 300ms to
 * confirm feels broken.
 */
export function FollowButton({
  handle,
  initialFollowing,
}: {
  handle: string;
  initialFollowing: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle() {
    if (busy) return;
    const next = !following;
    setFollowing(next);
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(handle)}/follow`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.following === "boolean") setFollowing(data.following);
        router.refresh();
      } else {
        setFollowing(!next);
      }
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      style={{
        flexShrink: 0,
        borderRadius: 10,
        padding: "9px 18px",
        fontSize: 14,
        fontWeight: 600,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
        background: following ? "transparent" : "#D4AF37",
        color: following ? "#B5B5BE" : "#0D0D0F",
        border: following ? "1px solid rgba(255,255,255,0.14)" : "none",
        transition: "background 160ms, color 160ms",
      }}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
