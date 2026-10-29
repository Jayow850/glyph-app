"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SeasonForm } from "./SeasonForm";
import { DivisionBuilder, type AllocatableMember } from "./DivisionBuilder";
import { ConfirmAction } from "./ConfirmAction";

interface MovementRow { name: string; rank: number; to: string }
interface DivisionMovement {
  name: string;
  unplayed: number;
  promoted: MovementRow[];
  relegated: MovementRow[];
}

/**
 * Everything an officer can do with the season, in one place.
 *
 * Collapsed by default. A club page is for members; the machinery for
 * running it should be one tap away and otherwise out of the way, the
 * way a secretary's folder is in a drawer and not on the table.
 */
export function OrganiserPanel({
  clubSlug,
  season,
  half,
  members,
  hasDivisions,
  canClose,
}: {
  clubSlug: string;
  season: { id: string; name: string; startsAt: string; halfwayAt: string; endsAt: string } | null;
  half: "AUTUMN" | "SPRING" | null;
  members: AllocatableMember[];
  hasDivisions: boolean;
  /** Closing a half or a season is a narrower power than running one. */
  canClose: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section
      style={{
        border: "1px dashed var(--border)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="press"
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "var(--s2)",
          padding: "var(--s3) var(--s4)", minHeight: 48,
          background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <Icon name="castle" size={16} />
        <span className="t-row" style={{ flex: 1 }}>Running the club</span>
        <span className="t-rowmeta">{season ? season.name : "no season open"}</span>
        <Icon name={open ? "chevronLeft" : "chevronRight"} size={16} />
      </button>

      {open && (
        <div
          style={{
            display: "flex", flexDirection: "column", gap: "var(--s4)",
            padding: "var(--s4)", borderTop: "1px solid var(--border)",
          }}
        >
          <div>
            <p className="section-label" style={{ marginBottom: "var(--s2)" }}>The season</p>
            <SeasonForm
              clubSlug={clubSlug}
              existing={
                season
                  ? {
                      name: season.name,
                      startsAt: season.startsAt,
                      halfwayAt: season.halfwayAt,
                      endsAt: season.endsAt,
                    }
                  : null
              }
            />
          </div>

          {season && half && (
            <div>
              <p className="section-label" style={{ marginBottom: "var(--s2)" }}>
                {half === "AUTUMN" ? "Autumn" : "Spring"} divisions
              </p>
              {hasDivisions ? (
                <p className="t-rowmeta">
                  Already set up. The tables are on the club page.
                </p>
              ) : members.length < 4 ? (
                <p className="t-rowmeta">
                  A league needs at least four members. You have{" "}
                  <span className="digits">{members.length}</span>.
                </p>
              ) : (
                <DivisionBuilder seasonId={season.id} half={half} members={members} />
              )}
            </div>
          )}

          {season && half && hasDivisions && canClose && (
            <div>
              <p className="section-label" style={{ marginBottom: "var(--s2)" }}>Closing</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s3)" }}>
                <ConfirmAction
                  label={`Close the ${half === "AUTUMN" ? "autumn" : "spring"} half`}
                  previewUrl={`/api/seasons/${season.id}/close?half=${half}&preview=1`}
                  commitUrl={`/api/seasons/${season.id}/close?half=${half}`}
                  heading="This is what will happen"
                  confirmLabel="Yes, settle the half"
                  danger
                  renderPreview={(data) => {
                    const movement = (data as { movement?: DivisionMovement[] }).movement ?? [];
                    const lines: string[] = [];
                    let unplayed = 0;
                    for (const d of movement) {
                      unplayed += d.unplayed;
                      for (const p of d.promoted) lines.push(`${p.name} goes up to the ${p.to}.`);
                      for (const r of d.relegated) lines.push(`${r.name} goes down to the ${r.to}.`);
                    }
                    return {
                      lines,
                      warning:
                        unplayed > 0
                          ? `${unplayed} ${unplayed === 1 ? "fixture is" : "fixtures are"} still unplayed. Closing now settles the table as it stands.`
                          : undefined,
                    };
                  }}
                />

                <ConfirmAction
                  label="Close the season"
                  previewUrl={`/api/seasons/${season.id}/close?preview=1`}
                  commitUrl={`/api/seasons/${season.id}/close`}
                  heading="The honours, as they will be written"
                  confirmLabel="Yes, close the season"
                  renderPreview={(data) => ({
                    lines: (data as { honours?: string[] }).honours ?? [],
                    warning: "This is permanent. The honours post is pinned to the club forever.",
                  })}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
