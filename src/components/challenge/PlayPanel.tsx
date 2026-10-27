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
      <div
        style={{
          display: "flex", gap: "var(--s2)", overflowX: "auto",
          marginLeft: "calc(-1 * var(--s4))", marginRight: "calc(-1 * var(--s4))",
          paddingLeft: "var(--s4)", paddingRight: "var(--s4)", paddingBottom: 2,
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

      {/* Settings, secondary weight, one row. */}
      <div style={{ display: "flex", gap: "var(--s2)", flexWrap: "wrap" }}>
        <Chip on={rated} onClick={() => setRated(true)}>Rated</Chip>
        <Chip on={!rated} onClick={() => setRated(false)}>Casual</Chip>
        <span style={{ width: 1, background: "var(--border)", margin: "4px 2px" }} />
        <Chip on={colour === "random"} onClick={() => setColour("random")}>Random</Chip>
        <Chip on={colour === "white"} onClick={() => setColour("white")}>White</Chip>
        <Chip on={colour === "black"} onClick={() => setColour("black")}>Black</Chip>
      </div>

      <div style={{ display: "flex", gap: "var(--s3)" }}>
        <button onClick={quickPlay} disabled={busy} className="press" style={action(true)}>
          <Icon name="zap" size={18} />
          {busy ? "Finding…" : "Quick play"}
        </button>
        <button onClick={() => setSheet(true)} disabled={busy} className="press" style={action(false)}>
          <Icon name="users" size={18} />
          Choose
        </button>
      </div>

      <p className="t-caption" style={{ color: "var(--text-dim)" }}>
        Quick play finds the club member closest to your {category.toLowerCase()} rating.
      </p>

      <OpponentSheet open={sheet} onClose={() => setSheet(false)} category={category} onPick={challenge} />
      <Toast message={message} />
    </section>
  );
}
