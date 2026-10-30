"use client";

import { useMemo, useState } from "react";
import { ListRow, ListGroup } from "@/components/ui/ListRow";

export interface MemberRow {
  userId: string;
  name: string;
  handle: string | null;
  country: string | null;
  title: string | null;
  role: string;
  roleRank: number;
  rating: number | null;
  ratingLabel: string;
  online: boolean;
  lastSeenAt: string | null;
  joinedAt: string;
}

const SORTS = [
  ["rating", "Rating"],
  ["name", "Name"],
  ["activity", "Activity"],
] as const;

type Sort = (typeof SORTS)[number][0];

/**
 * Everybody in the club.
 *
 * Officers are listed first whatever the sort, because service to a
 * club is unpaid and mostly invisible and this is the one page where
 * it is written down. The sort applies within each group rather than
 * across the whole list, so choosing "rating" never buries the
 * secretary somewhere in the middle.
 */
export function MemberList({ members }: { members: MemberRow[] }) {
  const [sort, setSort] = useState<Sort>("rating");

  const compare = useMemo(() => {
    if (sort === "name") return (a: MemberRow, b: MemberRow) => a.name.localeCompare(b.name);
    if (sort === "activity") {
      return (a: MemberRow, b: MemberRow) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        const at = a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0;
        const bt = b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0;
        return bt - at;
      };
    }
    return (a: MemberRow, b: MemberRow) => (b.rating ?? -1) - (a.rating ?? -1);
  }, [sort]);

  const officers = useMemo(
    () => members.filter((m) => m.role !== "PLAYER").sort((a, b) => a.roleRank - b.roleRank || compare(a, b)),
    [members, compare],
  );
  const players = useMemo(
    () => members.filter((m) => m.role === "PLAYER").sort(compare),
    [members, compare],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s4)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s2)", flexWrap: "wrap" }}>
        <span className="t-caption" style={{ color: "var(--text-dim)" }}>Sort by</span>
        {SORTS.map(([value, label]) => (
          <button
            key={value}
            onClick={() => setSort(value)}
            aria-pressed={sort === value}
            className="press"
            style={{
              minHeight: 32, padding: "0 12px", borderRadius: "var(--r-full)",
              cursor: "pointer", fontSize: "var(--t-caption)", fontWeight: 600,
              whiteSpace: "nowrap",
              border: `1px solid ${sort === value ? "var(--border-gold)" : "var(--border)"}`,
              background: sort === value ? "var(--gold-wash)" : "transparent",
              color: sort === value ? "var(--gold)" : "var(--text-muted)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {officers.length > 0 && (
        <section>
          <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>Officers</h2>
          <ListGroup>
            {officers.map((m) => <Row key={m.userId} m={m} />)}
          </ListGroup>
        </section>
      )}

      <section>
        <h2 className="section-label" style={{ marginBottom: "var(--s3)" }}>
          {officers.length > 0 ? "Members" : "Everybody"}
        </h2>
        {players.length === 0 ? (
          <p className="t-rowmeta">Nobody else yet.</p>
        ) : (
          <ListGroup>
            {players.map((m) => <Row key={m.userId} m={m} />)}
          </ListGroup>
        )}
      </section>
    </div>
  );
}

function Row({ m }: { m: MemberRow }) {
  return (
    <ListRow
      size="sm"
      href={m.handle ? `/profile/${m.handle}` : undefined}
      name={m.name}
      country={m.country}
      title={m.title}
      rating={m.ratingLabel}
      meta={[
        m.role !== "PLAYER" ? m.role.replace(/_/g, " ").toLowerCase() : null,
        m.online ? <span key="on" style={{ color: "var(--success)" }}>online</span> : null,
      ]}
    />
  );
}
