"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { field, submit } from "./AuthShell";

export function SignInForm({
  callbackUrl,
  initialError = false,
}: {
  callbackUrl: string;
  initialError?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(initialError);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailed(false);

    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setFailed(true);
      setBusy(false);
      return;
    }
    window.location.href = callbackUrl;
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="t-caption">Email</span>
        <input
          style={field}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="t-caption">Password</span>
        <input
          style={field}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>

      {failed && (
        <p className="t-secondary" role="alert" style={{ color: "var(--danger)" }}>
          {/* Deliberately not "no such account" — that tells a stranger which
              emails are registered here. */}
          Email or password is incorrect.
        </p>
      )}

      <button type="submit" disabled={busy} style={{ ...submit, opacity: busy ? 0.6 : 1 }} className="press">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
