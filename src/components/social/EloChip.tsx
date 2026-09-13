"use client";

export function band(elo: number) {
  if (elo >= 2200) return { name: "Master", color: "#D4AF37", crown: true };
  if (elo >= 2000) return { name: "Platinum", color: "#C9D6E3", crown: false };
  if (elo >= 1600) return { name: "Gold", color: "#D4AF37", crown: false };
  if (elo >= 1200) return { name: "Silver", color: "#B9B9C2", crown: false };
  return { name: "Bronze", color: "#B08D57", crown: false };
}

export function EloChip({ elo, onClick }: { elo: number; onClick?: () => void }) {
  const b = band(elo);
  return (
    <button
      onClick={onClick}
      className="digits inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ border: `1px solid ${b.color}`, color: b.color, background: "rgba(212,175,55,0.05)" }}
    >
      {b.crown && "♔"} {elo}
    </button>
  );
}
