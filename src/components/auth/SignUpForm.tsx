"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { field, submit } from "./AuthShell";

/** Derive a first-guess handle from a name, so nobody has to invent one. */
function handleFrom(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 20);
}

export function SignUpForm() {
  const [fullName, setFullName] = useState("");
  const [handle, setHandle] = useState("");
  const [touchedHandle, setTouchedHandle] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveHandle = touchedHandle ? handle : handleFrom(fullName);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, handle: effectiveHandle, email, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setBusy(false);
        return;
      }

      // Straight in — making someone sign in again right after creating
      // an account is a step that exists only for the developer.
      const signedIn = await signIn("credentials", { email, password, redirect: false });
      if (signedIn?.error) {
        setError("Account created, but sign-in failed. Try signing in.");
        setBusy(false);
        return;
      }
      window.location.href = "/challenges";
    } catch {
      setError("Could not reach the server. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="t-caption">Your name</span>
        <input
          style={field}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="t-caption">Handle</span>
        <div style={{ position: "relative" }}>
          <span
            aria-hidden="true"
            style={{
              position: "absolute", left: "var(--s3)", top: "50%", transform: "translateY(-50%)",
              color: "var(--text-dim)", pointerEvents: "none",
            }}
          >
            @
          </span>
          <input
            style={{ ...field, paddingLeft: "calc(var(--s3) + 16px)" }}
            value={effectiveHandle}
            onChange={(e) => { setTouchedHandle(true); setHandle(e.target.value.toLowerCase()); }}
            autoComplete="username"
            pattern="[a-z0-9_]{3,20}"
            title="3–20 characters: letters, numbers and underscores"
            required
          />
        </div>
      </label>

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
          autoComplete="new-password"
          minLength={8}
          required
        />
        <span className="t-caption" style={{ color: "var(--text-dim)" }}>At least 8 characters.</span>
      </label>

      {error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} style={{ ...submit, opacity: busy ? 0.6 : 1 }} className="press">
        {busy ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}
