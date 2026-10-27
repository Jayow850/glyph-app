"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";

export interface Player {
  id: string;
  handle: string;
  fullName: string;
  country: string | null;
  rating: string;
  reason: string;
  h2h: { w: number; l: number; d: number } | null;
  lastPlayed: string | null;
}

const SCOPES = [
  { id: "all", label: "All" },
  { id: "club", label: "Club" },
  { id: "recent", label: "Recent" },
  { id: "following", label: "Following" },
] as const;

function when(iso: string | null) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function Row({ player, onPick }: { player: Player; onPick: (p: Player) => void }) {
  const h = player.h2h;
  const played = h ? h.w + h.l + h.d : 0;
  const ago = when(player.lastPlayed);

  return (
    <button
      onClick={() => onPick(player)}
      className="press"
      style={{
        display: "flex", alignItems: "center", gap: "var(--s3)", width: "100%",
        minHeight: 64, padding: "var(--s3) var(--s3)",
        background: "transparent", border: "none", borderRadius: "var(--r-md)",
        cursor: "pointer", textAlign: "left", color: "var(--text)",
      }}
    >
      <Avatar name={player.fullName} size={40} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: "var(--t-body)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {player.fullName}
        </p>
        <p className="t-caption" style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          @{player.handle}
          {played > 0 && (
            <>
              {" · "}
              <span className="digits" style={{ color: h!.w > h!.l ? "var(--success)" : h!.w < h!.l ? "var(--danger)" : "var(--text-muted)" }}>
                {h!.w}–{h!.l}–{h!.d}
              </span>
              {ago && ` · ${ago}`}
            </>
          )}
          {played === 0 && player.reason && ` · ${player.reason}`}
        </p>
      </div>

      <span className="digits" style={{ fontSize: "var(--t-secondary)", fontWeight: 600, color: "var(--gold)" }}>
        {player.rating}
      </span>
      <span style={{ color: "var(--text-dim)" }}><Icon name="chevronRight" size={18} /></span>
    </button>
  );
}

function SkeletonRow() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)", minHeight: 64, padding: "var(--s3)" }}>
      <span className="skeleton" style={{ width: 40, height: 40, borderRadius: 12 }} />
      <div style={{ flex: 1 }}>
        <span className="skeleton" style={{ display: "block", height: 13, width: "45%", marginBottom: 7 }} />
        <span className="skeleton" style={{ display: "block", height: 11, width: "28%" }} />
      </div>
    </div>
  );
}

/**
 * The opponent picker. It used to be seven full-height rows rendered
 * inline on the page, pushing everything that mattered off screen.
 * A picker is not page content — it belongs in a sheet you summon.
 */
export function OpponentSheet({
  open,
  onClose,
  category,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  category: string;
  onPick: (p: Player) => void;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<string>("all");
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setScope("all");
      // A picker that opens with the keyboard up saves a tap.
      const t = setTimeout(() => input.current?.focus(), 240);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    const t = setTimeout(async () => {
      try {
        const url = `/api/users/search?q=${encodeURIComponent(query.trim())}&category=${category}&scope=${scope}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setPlayers(data.players ?? []);
      } catch {
        /* keep the previous list */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query.trim().length === 0 ? 0 : 200);

    return () => { cancelled = true; clearTimeout(t); };
  }, [open, query, scope, category]);

  return (
    <Sheet open={open} onClose={onClose} title="Choose an opponent">
      <div style={{ position: "relative", marginBottom: "var(--s3)" }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }}>
          <Icon name="search" size={18} />
        </span>
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or @handle"
          style={{
            width: "100%", boxSizing: "border-box", minHeight: 44,
            background: "var(--surface-2)", color: "var(--text)",
            border: "1px solid var(--border)", borderRadius: "var(--r-md)",
            padding: "0 var(--s3) 0 40px", fontSize: "var(--t-body)", outline: "none",
          }}
        />
      </div>

      <div style={{ display: "flex", gap: "var(--s2)", marginBottom: "var(--s2)", overflowX: "auto", paddingBottom: 2 }}>
        {SCOPES.map((s) => {
          const on = s.id === scope;
          return (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className="press"
              style={{
                flexShrink: 0, borderRadius: "var(--r-full)",
                padding: "7px 14px", fontSize: "var(--t-secondary)", fontWeight: 600,
                cursor: "pointer",
                background: on ? "var(--gold)" : "transparent",
                color: on ? "var(--gold-ink)" : "var(--text-muted)",
                border: on ? "1px solid transparent" : "1px solid var(--border)",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {loading && players.length === 0 ? (
        <>
          <SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow />
        </>
      ) : players.length === 0 ? (
        <div style={{ textAlign: "center", padding: "var(--s10) var(--s4)" }}>
          <span style={{ color: "var(--text-dim)", display: "inline-block", marginBottom: "var(--s3)" }}>
            <Icon name="users" size={32} />
          </span>
          <p className="t-secondary">
            {query.trim() ? "Nobody by that name." : "No players here yet."}
          </p>
        </div>
      ) : (
        players.map((p) => <Row key={p.id} player={p} onPick={onPick} />)
      )}
    </Sheet>
  );
}
