"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PRESETS, classify, parseId, DEFAULT_PRESET_ID } from "@engine/game/timeControls";
import { Icon, SPEED_ICON } from "@/components/ui/Icon";
import { Toast, useToast } from "@/components/ui/Toast";
import { OpponentSheet, type Player } from "./OpponentSheet";

const LAST_CHOICE = "glyph.lastTimeControl";

/** One control language on this page: a pill. Selected fills gold. */
function Chip({
  on, onClick, children, grow = false,
}: {
  on: boolean; onClick: () => void; children: React.ReactNode; grow?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="press"
      style={{
        flex: grow ? 1 : "0 0 auto",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        minHeight: 40, padding: "0 14px",
        borderRadius: "var(--r-full)",
        fontSize: "var(--t-secondary)", fontWeight: 600,
        whiteSpace: "nowrap", cursor: "pointer",
        background: on ? "var(--gold)" : "transparent",
        color: on ? "var(--gold-ink)" : "var(--text-muted)",
        border: on ? "1px solid transparent" : "1px solid var(--border)",
        transition: "background 160ms var(--ease), color 160ms var(--ease)",
      }}
    >
      {children}
    </button>
  );
}

/**
 * The play panel.
 *
 * This replaces a three-screen form whose primary button started
 * disabled and read "Pick an opponent" — a dead end as a call to
 * action. Here the decision is one chip, the settings are secondary,
 * and the main button is always pressable.
 */
export function PlayPanel() {
  const [presetId, setPresetId] = useState(DEFAULT_PRESET_ID);
  const [rated, setRated] = useState(true);
  const [colour, setColour] = useState<"random" | "white" | "black">("random");
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [help, setHelp] = useState(false);

  const router = useRouter();
  const { message, show } = useToast();

  const category = useMemo(() => {
    const { base, increment } = parseId(presetId);
    return classify(base, increment);
  }, [presetId]);

  // A returning player should be one tap from the game they always play.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_CHOICE);
      if (saved && PRESETS.some((p) => p.id === saved)) setPresetId(saved);
    } catch {
      /* private browsing — the default is fine */
    }
  }, []);

  function choose(id: string) {
    setPresetId(id);
    try {
      localStorage.setItem(LAST_CHOICE, id);
    } catch {
      /* the choice still holds for this session */
    }
  }

  async function quickPlay() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/challenges/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeControl: presetId, rated, color: colour }),
      });
      const data = await res.json();
      if (res.ok) {
        show(`Challenge sent to ${data.opponent}.`);
        router.refresh();
      } else if (data.error === "all_busy") {
        show("Everyone you could play already has a challenge open.", "bad");
      } else {
        show("Nobody available to play right now.", "bad");
      }
    } catch {
      show("Could not reach the server.", "bad");
    } finally {
      setBusy(false);
    }
  }

  async function challenge(player: Player) {
    setSheet(false);
    setBusy(true);
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toId: player.id, timeControl: presetId, color: colour, rated }),
      });
      if (res.ok) {
        show(`Challenge sent to ${player.fullName}.`);
        router.refresh();
      } else {
        show("That challenge didn't send.", "bad");
      }
    } catch {
      show("Could not reach the server.", "bad");
    } finally {
      setBusy(false);
    }
  }

  /** Put a seek on the club board instead of naming an opponent. */
  async function postSeek() {
    setBusy(true);
    try {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeControl: presetId, color: colour, rated }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.duplicate) show("That seek is already on the board.");
      else if (res.ok) show("Posted to your club. Anyone can take it.");
      else if (data.error === "no_club") show("Join a club to post an open seek.", "bad");
      else show("Could not post that seek.", "bad");
      router.refresh();
    } catch {
      show("Could not reach the server.", "bad");
    } finally {
      setBusy(false);
    }
  }

  const action = (primary: boolean) => ({
    flex: 1, minHeight: 48, borderRadius: "var(--r-md)",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--s2)",
    fontSize: "var(--t-body)", fontWeight: 600, cursor: busy ? "default" : "pointer",
    background: primary ? "var(--gold)" : "var(--surface-2)",
    color: primary ? "var(--gold-ink)" : "var(--text)",
    border: primary ? "1px solid transparent" : "1px solid var(--border)",
    opacity: busy ? 0.55 : 1,
  });

  return (
    <section className="card" style={{ padding: "var(--s4)", display: "flex", flexDirection: "column", gap: "var(--s4)" }}>
      {/* Time control — the only real decision, so it leads. */}
      <div style={{ position: "relative", marginLeft: "calc(-1 * var(--s4))", marginRight: "calc(-1 * var(--s4))" }}>
      <div
        className="chip-row"
        style={{
          display: "flex", gap: "var(--s2)", overflowX: "auto",
          paddingLeft: "var(--s4)", paddingRight: "var(--s6)", paddingBottom: 2,
          scrollbarWidth: "none",
        }}
      >
        {PRESETS.map((p) => (
          <Chip key={p.id} on={p.id === presetId} onClick={() => choose(p.id)}>
            <Icon name={SPEED_ICON[p.category] ?? "timer"} size={15} />
            <span className="digits">{p.label}</span>
          </Chip>
        ))}
      </div>
      <span
        aria-hidden="true"
        style={{
          position: "absolute", right: 0, top: 0, bottom: 2, width: 28,
          pointerEvents: "none",
          background: "linear-gradient(to right, transparent, var(--surface))",
        }}
      />
      </div>

      {/* Two segmented controls rather than five loose chips: at 360px
          the chips wrapped and "Black" dropped onto a line of its own,
          which read as a layout accident. Segments cannot wrap. */}
      <div style={{ display: "flex", gap: "var(--s2)" }}>
        <Segmented
          label="Stake"
          options={[{ id: "rated", label: "Rated" }, { id: "casual", label: "Casual" }]}
          value={rated ? "rated" : "casual"}
          onChange={(v) => setRated(v === "rated")}
        />
        <Segmented
          label="Colour"
          options={[
            { id: "random", label: "Random" },
            { id: "white", label: "White" },
            { id: "black", label: "Black" },
          ]}
          value={colour}
          onChange={(v) => setColour(v as typeof colour)}
        />
      </div>

      <button onClick={quickPlay} disabled={busy} className="press" style={{ ...action(true), minHeight: 52, width: "100%" }}>
        <Icon name="zap" size={19} />
        {busy ? "Finding…" : "Quick play"}
      </button>

      <div style={{ display: "flex", gap: "var(--s3)", marginTop: "calc(-1 * var(--s2))" }}>
        <button onClick={() => setSheet(true)} disabled={busy} className="press" style={{ ...action(false), minHeight: 44 }}>
          <Icon name="users" size={17} />
          Choose opponent
        </button>
        <button onClick={postSeek} disabled={busy} className="press" style={{ ...action(false), minHeight: 44, background: "transparent" }}>
          <Icon name="inbox" size={17} />
          Post seek
        </button>
      </div>

      <div>
        <button
          onClick={() => setHelp((h) => !h)}
          aria-expanded={help}
          className="press"
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: "none", border: "none", padding: 0, cursor: "pointer",
            color: "var(--text-dim)", fontSize: "var(--t-caption)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 15, height: 15, borderRadius: "50%", display: "grid", placeItems: "center",
              border: "1px solid currentColor", fontSize: 10, fontWeight: 700, lineHeight: 1,
            }}
          >
            i
          </span>
          How this works
        </button>
        {help && (
          <p className="t-caption" style={{ color: "var(--text-dim)", marginTop: "var(--s2)" }}>
            Quick play finds the club member closest to your {category.toLowerCase()} rating.
            Choose picks a specific opponent. A seek posted to the club board waits
            20 minutes for anyone in your club to take it.
          </p>
        )}
      </div>

      <OpponentSheet open={sheet} onClose={() => setSheet(false)} category={category} onPick={challenge} />
      <Toast message={message} />
    </section>
  );
}

/**
 * A segmented control, not a row of chips.
 *
 * Chips wrap, and at 360px the colour chips wrapped so that "Black"
 * landed alone on the next line — which reads as something broken
 * rather than something designed. Segments share a track and shrink
 * instead.
 */
function Segmented({
  label, options, value, onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{
        display: "flex", flex: 1, minWidth: 0, gap: 2, padding: 3,
        background: "var(--surface-2)", border: "1px solid var(--border)",
        borderRadius: "var(--r-full)",
      }}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className="press"
            style={{
              flex: 1, minWidth: 0, borderRadius: "var(--r-full)", border: "none",
              padding: "7px 4px", fontSize: "var(--t-caption)", fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis",
              background: on ? "var(--gold)" : "transparent",
              color: on ? "var(--gold-ink)" : "var(--text-muted)",
              transition: "background 160ms var(--ease), color 160ms var(--ease)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
