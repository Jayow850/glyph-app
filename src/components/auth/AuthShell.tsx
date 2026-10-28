import Link from "next/link";

/**
 * The frame both auth pages share.
 *
 * Signing in is the first thing anyone sees of GLYPH, so it gets the
 * wordmark and the same surfaces as the rest of the app rather than
 * NextAuth's default page, which belongs to no product in particular.
 */
export function AuthShell({
  title,
  sub,
  children,
  footer,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "calc(100dvh - 56px)",
        display: "grid",
        placeItems: "center",
        padding: "var(--s5) var(--s4)",
        paddingBottom: "calc(var(--s5) + env(safe-area-inset-bottom))",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <Link
          href="/"
          className="font-display"
          style={{
            display: "block",
            textAlign: "center",
            fontSize: 28,
            fontWeight: 600,
            textDecoration: "none",
            color: "var(--text)",
            marginBottom: "var(--s5)",
          }}
        >
          GLYPH<span style={{ color: "var(--gold)" }}>.</span>
        </Link>

        <h1 className="t-h2" style={{ marginBottom: sub ? "var(--s1)" : "var(--s4)" }}>
          {title}
        </h1>
        {sub && <p className="t-rowmeta" style={{ marginBottom: "var(--s4)" }}>{sub}</p>}

        {children}

        <p className="t-rowmeta" style={{ textAlign: "center", marginTop: "var(--s4)" }}>
          {footer}
        </p>
      </div>
    </div>
  );
}

export const field: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "0 var(--s3)",
  borderRadius: "var(--r-md)",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontSize: 16, // 16px or iOS zooms the page on focus
};

export const submit: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  borderRadius: "var(--r-full)",
  border: "none",
  background: "var(--gold)",
  color: "var(--gold-ink)",
  fontSize: "var(--t-body)",
  fontWeight: 600,
  cursor: "pointer",
};
