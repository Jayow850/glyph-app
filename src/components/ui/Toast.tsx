"use client";

import { useCallback, useRef, useState } from "react";

export interface ToastMessage {
  text: string;
  tone: "ok" | "bad";
}

/** Local toast state. Every outcome on a page should say something. */
export function useToast() {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, tone: "ok" | "bad" = "ok") => {
    if (timer.current) clearTimeout(timer.current);
    setMessage({ text, tone });
    timer.current = setTimeout(() => setMessage(null), 3200);
  }, []);

  return { message, show };
}

export function Toast({ message }: { message: ToastMessage | null }) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "calc(84px + env(safe-area-inset-bottom, 0px))",
        zIndex: 90,
        maxWidth: "calc(100vw - 32px)",
        padding: "var(--s3) var(--s5)",
        borderRadius: "var(--r-full)",
        background: "var(--surface-2)",
        border: `1px solid ${message.tone === "bad" ? "var(--danger)" : "var(--border-gold)"}`,
        color: message.tone === "bad" ? "var(--danger)" : "var(--text)",
        fontSize: "var(--t-secondary)",
        fontWeight: 500,
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        animation: "toast-in 200ms var(--ease) both",
      }}
    >
      {message.text}
      <style>{`@keyframes toast-in { from { opacity: 0; transform: translate(-50%, 8px) } to { opacity: 1; transform: translate(-50%, 0) } }`}</style>
    </div>
  );
}
