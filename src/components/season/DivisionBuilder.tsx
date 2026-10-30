"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";

export interface AllocatableMember {
  userId: string;
  name: string;
  rating: number | null;
}

/**
 * Build the half's divisions, and put everybody in one.
 *
 * Two things this gets right that a generic admin screen would not:
 *
 * Divisions are NAMED. Real clubs name them after members who served
 * the club — the Homan League, the Dunleavy League — and a numbered
 * list throws away the only part anybody is sentimental about. The
 * name field is first and it is empty, not pre-filled with "Division 1".
 *
 * The rating split is a SUGGESTION. It seeds the allocation so a
 * secretary with thirty members is not placing thirty people by hand,
 * but every one is a dropdown they can change — because they know who
 * has improved since March and who has not played since Easter, and no
 * rating knows that.
 */
export function DivisionBuilder({
  seasonId,
  half,
  members,
}: {
  seasonId: string;
  half: "AUTUMN" | "SPRING";
  members: AllocatableMember[];
}) {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState<string[]>(["", ""]);
  const [promoteCount, setPromoteCount] = useState(2);
  const [relegateCount, setRelegateCount] = useState(2);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const count = names.length;

  /** Strongest first, unrated last — they go in the bottom division. */
  const ordered = useMemo(
    () => [...members].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1)),
    [members],
  );

  /** Even bands by rating, which is where a secretary starts from. */
  const suggested = useMemo(() => {
    const out: Record<string, number> = {};
    const per = Math.ceil(ordered.length / count);
    ordered.forEach((m, i) => { out[m.userId] = Math.min(count - 1, Math.floor(i / per)); });
    return out;
  }, [ordered, count]);

  const tierOf = (userId: string) => overrides[userId] ?? suggested[userId] ?? 0;

  const sizes = useMemo(() => {
    const s = Array(count).fill(0);
    for (const m of ordered) s[tierOf(m.userId)] = (s[tierOf(m.userId)] ?? 0) + 1;
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, overrides, suggested, count]);

  const unnamed = names.some((n) => !n.trim());
  const tooSmall = sizes.some((n) => n < 2);

  // The division that will constrain the movement counts.
  const smallest = sizes.length ? Math.min(...sizes) : 0;
  const movementTooBig = smallest >= 2 && promoteCount + relegateCount > smallest - 1;

  async function create() {
    if (busy || unnamed || tooSmall) return;
    setBusy(true);
    setError(null);
    try {
      for (let tier = 0; tier < count; tier++) {
        const userIds = ordered.filter((m) => tierOf(m.userId) === tier).map((m) => m.userId);
        const res = await fetch(`/api/seasons/${seasonId}/divisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            half,
            name: names[tier].trim(),
            tier,
            promoteCount,
            relegateCount,
            userIds,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Could not create the division.");
        }
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the divisions.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="press"
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, minHeight: 38,
          padding: "0 14px", borderRadius: "var(--r-full)", cursor: "pointer",
          background: "var(--gold)", color: "var(--gold-ink)", border: "none",
          fontSize: "var(--t-secondary)", fontWeight: 600,
        }}
      >
        <Icon name="plus" size={14} />
        Set up the divisions
      </button>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)", overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", padding: "var(--s3) var(--s4)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="t-row">Divisions — {half === "AUTUMN" ? "autumn" : "spring"} half</p>
          <p className="t-rowmeta">
            <span className="digits">{members.length}</span> members to place.
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="press"
          style={{
            width: 32, height: 32, borderRadius: "var(--r-md)", flexShrink: 0,
            display: "grid", placeItems: "center", cursor: "pointer",
            background: "transparent", border: "none", color: "var(--text-dim)",
          }}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* Naming comes first, because it is the part that matters. */}
      <div style={{ padding: "var(--s3) var(--s4)", borderTop: "1px solid var(--border)" }}>
        <p className="t-caption" style={{ marginBottom: "var(--s2)" }}>
          Name them after members who served the club, not after numbers.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
          {names.map((n, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--s2)" }}>
              <span
                className="digits"
                style={{
                  width: 22, flexShrink: 0, textAlign: "right",
                  fontSize: 12, color: "var(--text-dim)",
                }}
              >
                {i + 1}
              </span>
              <input
                style={{ ...field, flex: 1, minWidth: 0 }}
                value={n}
                placeholder={i === 0 ? "e.g. Homan League" : "e.g. Dunleavy League"}
                onChange={(e) => setNames(names.map((v, j) => (j === i ? e.target.value : v)))}
                maxLength={60}
              />
              <span className="t-rowmeta" style={{ width: 54, flexShrink: 0, textAlign: "right" }}>
                <span className="digits">{sizes[i] ?? 0}</span> in
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", marginTop: "var(--s2)" }}>
          <button
            onClick={() => setNames([...names, ""])}
            disabled={count >= 4}
            className="press"
            style={{ ...small, opacity: count >= 4 ? 0.4 : 1 }}
          >
            Add a division
          </button>
          {count > 2 && (
            <button
              onClick={() => { setNames(names.slice(0, -1)); setOverrides({}); }}
              className="press"
              style={small}
            >
              Remove the last
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "var(--s3)", padding: "var(--s3) var(--s4)", borderTop: "1px solid var(--border)",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="t-caption">Promoted each half</span>
          <select style={field} value={promoteCount} onChange={(e) => setPromoteCount(Number(e.target.value))}>
            {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="t-caption">Relegated each half</span>
          <select style={field} value={relegateCount} onChange={(e) => setRelegateCount(Number(e.target.value))}>
            {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      {/* Somebody has to stay. Told to the organiser here, where the
          numbers are chosen, rather than discovered later by a member
          reading "Top 2 promoted. Bottom 2 relegated." above a
          division of two. */}
      {movementTooBig && (
        <p
          className="t-caption"
          style={{
            padding: "0 var(--s4) var(--s3)", color: "var(--text-muted)",
            display: "flex", gap: 6, alignItems: "flex-start",
          }}
        >
          <span style={{ flexShrink: 0, marginTop: 1 }}><Icon name="hourglass" size={12} /></span>
          <span>
            {smallest === 2
              ? "A division of two cannot promote and relegate two each. It will move at most one."
              : `Your smallest division has ${smallest}. Promotion and relegation will be capped so somebody stays.`}
          </span>
        </p>
      )}

      {/* Seeded by rating, changed by judgement. */}
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <p className="t-caption" style={{ padding: "var(--s2) var(--s4)" }}>
          Suggested by rating. Change any of them.
        </p>
        {ordered.map((m) => (
          <div
            key={m.userId}
            style={{
              display: "flex", alignItems: "center", gap: "var(--s2)",
              padding: "var(--s2) var(--s4)", minHeight: 48,
              borderTop: "1px solid var(--border)",
            }}
          >
            <Avatar name={m.name} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                className="t-rowmeta"
                style={{
                  color: "var(--text)", overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {m.name}
              </p>
              <p className="t-caption" style={{ color: "var(--text-dim)" }}>
                {m.rating ? <span className="digits">{m.rating}</span> : "unrated"}
              </p>
            </div>
            <select
              aria-label={`Division for ${m.name}`}
              style={{ ...field, width: "auto", minWidth: 110, flexShrink: 0 }}
              value={tierOf(m.userId)}
              onChange={(e) => setOverrides({ ...overrides, [m.userId]: Number(e.target.value) })}
            >
              {names.map((n, i) => (
                <option key={i} value={i}>{n.trim() || `Division ${i + 1}`}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div style={{ padding: "var(--s3) var(--s4)", borderTop: "1px solid var(--border)" }}>
        {unnamed && (
          <p className="t-caption" style={{ color: "var(--gold)", marginBottom: "var(--s2)" }}>
            Every division needs a name.
          </p>
        )}
        {tooSmall && (
          <p className="t-caption" style={{ color: "var(--gold)", marginBottom: "var(--s2)" }}>
            A division needs at least two members to have any fixtures.
          </p>
        )}
        {error && (
          <p className="t-secondary" role="alert" style={{ color: "var(--danger)", marginBottom: "var(--s2)" }}>
            {error}
          </p>
        )}
        <p className="t-caption" style={{ color: "var(--text-dim)", marginBottom: "var(--s2)" }}>
          Every pair in a division gets a fixture. Members arrange them between
          themselves.
        </p>
        <button
          onClick={create}
          disabled={busy || unnamed || tooSmall}
          className="press"
          style={{
            minHeight: 40, padding: "0 18px", borderRadius: "var(--r-full)", border: "none",
            background: "var(--gold)", color: "var(--gold-ink)",
            fontSize: "var(--t-secondary)", fontWeight: 600,
            cursor: busy || unnamed || tooSmall ? "default" : "pointer",
            opacity: busy || unnamed || tooSmall ? 0.5 : 1,
          }}
        >
          {busy ? "Creating…" : `Create ${count} divisions and their fixtures`}
        </button>
      </div>
    </div>
  );
}

const field: React.CSSProperties = {
  width: "100%",
  minHeight: 44,
  padding: "0 var(--s2)",
  borderRadius: "var(--r-md)",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontSize: 16,
};

const small: React.CSSProperties = {
  minHeight: 34,
  padding: "0 12px",
  borderRadius: "var(--r-full)",
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
