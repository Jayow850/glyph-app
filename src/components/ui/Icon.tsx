/**
 * One icon set, drawn as line art at stroke 1.5.
 * Emoji were rendering differently on every device and reading as
 * unfinished; these are deterministic and inherit currentColor.
 */
const PATHS = {
  zap: <path d="M13 2 4.5 13.5H11l-.8 8.5L19.5 10.5H13z" />,
  timer: <><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4h3" /><path d="M9.5 2h5" /></>,
  hourglass: <><path d="M7 2.5h10" /><path d="M7 21.5h10" /><path d="M7.5 2.5v4.2L12 11l4.5-4.3V2.5" /><path d="M7.5 21.5v-4.2L12 13l4.5 4.3v4.2" /></>,
  castle: <><path d="M6.6 4.6h2.2v2h2.1v-2h2.2v2h2.1v-2h2.2V8l-1.6 1.3v6.4L18.2 19H5.8l1.6-3.3V9.3L5.8 8z" /></>,
  swords: <><path d="M4 3.6h3.1L19 15.5v3.1h-3.1L4 6.7z" /><path d="M20 3.6h-3.1L5 15.5v3.1h3.1L20 6.7z" /></>,
  users: <><circle cx="9.5" cy="8" r="3.3" /><path d="M3 19.5c0-3.2 2.9-5.4 6.5-5.4s6.5 2.2 6.5 5.4" /><path d="M16.5 5.2a3.3 3.3 0 0 1 0 6" /><path d="M18 14.6c2.1.7 3.5 2.4 3.5 4.9" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.3l3.3 2" /></>,
  check: <path d="m4.5 12.6 5 5L19.5 6.5" />,
  x: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  search: <><circle cx="11" cy="11" r="6.8" /><path d="m16.2 16.2 4.3 4.3" /></>,
  chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  inbox: <><path d="M3.5 12.5h4l1.4 2.6h6.2l1.4-2.6h4" /><path d="M5.6 5.2h12.8l2.6 7.3v4.3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4.3z" /></>,
  plus: <><path d="M12 5.5v13" /><path d="M5.5 12h13" /></>,
  bolt: <path d="M13 2 4.5 13.5H11l-.8 8.5L19.5 10.5H13z" />,
  send: <><path d="m21 3-9.5 9.5" /><path d="M21 3 14.5 21l-3-7.5L4 10.5z" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.5,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}

/** The icon that stands for each speed of chess. */
export const SPEED_ICON: Record<string, IconName> = {
  BULLET: "zap",
  BLITZ: "bolt",
  RAPID: "timer",
  CLASSICAL: "hourglass",
};
