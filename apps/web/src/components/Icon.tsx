// Small stroke icon set used instead of emoji, so the site renders the same
// on every device and inherits the text colour.
const PATHS = {
  excavator: (
    <>
      <path d="M2 18h11" />
      <circle cx="4.5" cy="18.5" r="1.5" />
      <circle cx="10.5" cy="18.5" r="1.5" />
      <path d="M3 15h9v-4H8l-2 4" />
      <path d="M12 11l4-6 5 3" />
      <path d="M21 8v4l-3 1" />
    </>
  ),
  hammer: (
    <>
      <path d="M14 4l6 6-3 3-6-6z" />
      <path d="M12.5 8.5L4 17l3 3 8.5-8.5" />
    </>
  ),
  crane: (
    <>
      <path d="M3 21h8" />
      <path d="M6 21V5h1l12 3" />
      <path d="M6 5l13 3v3" />
      <path d="M19 11v2" />
      <rect x="17" y="13" width="4" height="3" rx="0.5" />
      <path d="M6 9l4-3M6 13l4-4M6 17l4-4" />
    </>
  ),
  loader: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="16" cy="18" r="2.5" />
      <path d="M3 15V9h7l2 6" />
      <path d="M12 12h4l3-5" />
      <path d="M19 7h3v5h-4" />
    </>
  ),
  tractor: (
    <>
      <circle cx="7" cy="16" r="4" />
      <circle cx="18" cy="18" r="2" />
      <path d="M4 12V6h6l2 6" />
      <path d="M11 12h8l1 5" />
      <path d="M16 12V8" />
    </>
  ),
  helmet: (
    <>
      <path d="M3 17h18" />
      <path d="M5 17a7 7 0 0 1 14 0" />
      <path d="M10 10V7h4v3" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  document: (
    <>
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z" />
      <path d="M14 3v4h4" />
      <path d="M9 13l2 2 4-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  phone: (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = 'h-6 w-6' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
