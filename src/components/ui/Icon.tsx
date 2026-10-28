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
  chevronLeft: <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
  skipBack: <><path d="m18 5.5-9 6.5 9 6.5z" /><path d="M6 5.5v13" /></>,
  skipForward: <><path d="m6 5.5 9 6.5-9 6.5z" /><path d="M18 5.5v13" /></>,
  flag: <><path d="M5.5 21V3.5" /><path d="M5.5 4.5h11l-2 3.8 2 3.8h-11" /></>,
  handshake: <><path d="m3 11.5 3.2-3.2h4.1L12 9.8l1.7-1.5h4.1L21 11.5" /><path d="M7 13.5 9.6 16a1.6 1.6 0 0 0 2.3 0l.6-.6.9.9a1.5 1.5 0 0 0 2.2-2l-3.1-3" /></>,
  rotate: <><path d="M20 12a8 8 0 1 1-2.6-5.9" /><path d="M20.5 3.5V8H16" /></>,
  volume: <><path d="M11 5.5 6.8 9H3.5v6h3.3L11 18.5z" /><path d="M15 9.2a4 4 0 0 1 0 5.6" /></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /><rect x="13.5" y="13.5" width="7" height="7" rx="1" /></>,
  list: <><path d="M9 6.5h11.5" /><path d="M9 12h11.5" /><path d="M9 17.5h11.5" /><path d="M4 6.5h1.5" /><path d="M4 12h1.5" /><path d="M4 17.5h1.5" /></>,
  chat: <path d="M20.5 12.2c0 3.9-3.8 7-8.5 7a9.8 9.8 0 0 1-2.6-.35L4 20.5l1.3-3.4a6.5 6.5 0 0 1-1.8-4.4c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7z" />,
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
