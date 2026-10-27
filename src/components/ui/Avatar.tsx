const TINTS = ["#5E7A63", "#9A6A43", "#58627A", "#7A5E6E", "#4A6B78", "#6E6A45"];

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function tintFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

/** Initials on a deterministic tint — the same person is the same colour everywhere. */
export function Avatar({
  name,
  size = 40,
  ring = false,
}: {
  name: string;
  size?: number;
  ring?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        background: tintFor(name),
        color: "#F5F1E8",
        fontSize: Math.round(size * 0.37),
        fontWeight: 600,
        letterSpacing: "0.01em",
        boxShadow: ring ? "0 0 0 2px var(--gold)" : "none",
        transition: "box-shadow 160ms var(--ease)",
      }}
    >
      {initialsOf(name)}
    </span>
  );
}
