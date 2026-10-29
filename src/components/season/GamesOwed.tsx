"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { Flag } from "@/components/ui/Flag";
import { Icon } from "@/components/ui/Icon";

export interface OwedFixture {
  fixtureId: string;
  opponentId: string;
  opponentName: string;
  opponentCountry: string | null;
  colour: "white" | "black";
  state: string;
  dueBy: string | null;
  arrangedAt: string | null;
}

/**
 * Who you still owe a game to.
 *
 * This is the one list a league member needs, and it is the thing
 * that makes an arranged-fixture league work at all: without it,
 * nobody remembers who they have left, and the half ends with a third
 * of the games unplayed. Each row is a person to message, not a slot
 * in a draw.
 */
export function GamesOwed({
  divisionName,
  fixtures,
}: {
  divisionName: string;
  fixtures: OwedFixture[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [arranged, setArranged] = useState<Set<string>>(
    () => new Set(fixtures.filter((f) => f.arrangedAt).map((f) => f.fixtureId)),
  );
  const router = useRouter();

  async function arrange(fixtureId: string) {
    if (busy) return;
    setBusy(fixtureId);
    const next = new Set(arranged);
    next.add(fixtureId);
    setArranged(next);
    try {
      const res = await fetch(`/api/fixtures/${fixtureId}/arrange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ when: null }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      const rollback = new Set(next);
      rollback.delete(fixtureId);
      setArranged(rollback);
    } finally {
      setBusy(null);
    }
  }

  if (fixtures.length === 0) {
    return (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "var(--s4)",
          display: "flex",
          alignItems: "center",
          gap: "var(--s2)",
        }}
      >
        <Icon name="check" size={14} />
        <p className="t-rowmeta">
          All your {divisionName} games are played. Nothing owed.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "var(--s3) var(--s4)", borderBottom: "1px solid var(--border)" }}>
        <p className="t-row">
          You owe <span className="digits">{fixtures.length}</span>{" "}
          {fixtures.length === 1 ? "game" : "games"}
        </p>
        <p className="t-rowmeta">{divisionName} — arrange these between you.</p>
      </div>

      {fixtures.map((f) => {
        const isArranged = arranged.has(f.fixtureId);
        const due = f.dueBy ? new Date(f.dueBy) : null;
        const soon = due ? due.getTime() - Date.now() < 10 * 86_400_000 : false;

        return (
          <div
            key={f.fixtureId}
            style={{
              display: "flex", alignItems: "center", gap: "var(--s3)",
              padding: "var(--s3) var(--s4)", minHeight: 56,
              borderTop: "1px solid var(--border)",
            }}
          >
            <Avatar name={f.opponentName} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                className="t-row"
                style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.opponentName}
                </span>
                {f.opponentCountry && <Flag code={f.opponentCountry} height={10} />}
              </p>
              {/* One line, never two. "You have white · due Nov 3" wrapped
                  at 360px, and a fixture list that reflows is a fixture
                  list nobody scans. Colour leads because it decides who
                  brings the set out. */}
              <p
                className="t-rowmeta"
                style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {f.colour === "white" ? "White" : "Black"}
                {due && (
                  <>
                    {" · due "}
                    <span style={{ color: soon ? "var(--gold)" : undefined }}>
                      {due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </span>
                  </>
                )}
              </p>
            </div>

            <button
              onClick={() => arrange(f.fixtureId)}
              disabled={isArranged || busy === f.fixtureId}
              className="press"
              style={{
                flexShrink: 0, minHeight: 34, padding: "0 12px",
                borderRadius: "var(--r-full)", cursor: isArranged ? "default" : "pointer",
                fontSize: 13, fontWeight: 600,
                background: isArranged ? "transparent" : "var(--surface-2)",
                color: isArranged ? "var(--text-dim)" : "var(--text)",
                border: isArranged ? "1px solid var(--border)" : "none",
              }}
            >
              {isArranged ? "Arranged" : "Arrange"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
