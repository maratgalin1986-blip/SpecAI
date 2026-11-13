// Line icons of the 3D block and the walk, drawn like components/Icon.tsx
// (24×24, stroke 1.6–2, currentColor), instead of emoji that look different on
// every phone.
const PATHS = {
  close: <path d="M6 6l12 12M18 6L6 18" />,
  prev: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
  pause: (
    <>
      <rect x="6.5" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" />
      <rect x="13.9" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  walk: (
    <>
      <circle cx="13.5" cy="4.5" r="1.8" />
      <path d="M12.5 8.5l-1.5 6M11 14.5l-3 5.5M11 14.5l3 2 1 3.5M8 12l2.5-3.5h2.5l2 3 2.5 1" />
    </>
  ),
  soundOn: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" />
    </>
  ),
  soundOff: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
} as const;

export type WorldIconName = keyof typeof PATHS;

export function WorldIcon({
  name,
  className = 'h-5 w-5',
}: {
  name: WorldIconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
