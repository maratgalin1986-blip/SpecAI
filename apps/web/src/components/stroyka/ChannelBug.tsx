import { SITE } from '@/lib/site';

// A TV-channel corner logo («бaг») over the /stroyka footage: small and
// semi-transparent, like a broadcast channel's mark, so the films read as
// «СпецПласт16 on air» without a word of advertising. Never takes a tap.
const CORNERS = {
  // The /stroyka tour: under the weather line on phones (the top corners are
  // the top bar's, the bottom the subtitle bar's); a true bottom-right corner
  // on wider screens, beside the centred dialogue box.
  tour: 'right-3 top-[calc(max(0.5rem,env(safe-area-inset-top))+6.25rem)] sm:bottom-5 sm:right-5 sm:top-auto',
  'top-left': 'left-3 top-[max(0.75rem,env(safe-area-inset-top))] sm:left-5 sm:top-5',
  'top-right': 'right-3 top-[max(0.75rem,env(safe-area-inset-top))] sm:right-5 sm:top-5',
  'bottom-left': 'bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 sm:bottom-5 sm:left-5',
  'bottom-right':
    'bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 sm:bottom-5 sm:right-5',
} as const;

export function ChannelBug({
  corner = 'top-right',
  className = '',
}: {
  corner?: keyof typeof CORNERS;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      data-testid="channel-bug"
      className={`pointer-events-none absolute z-[5] flex select-none items-center gap-1.5 opacity-60 ${CORNERS[corner]} ${className}`}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden>
        {/* An excavator bucket in a rounded square: the channel's mark. */}
        <rect x="1" y="1" width="18" height="18" rx="5" fill="#f59e0b" fillOpacity="0.85" />
        <path d="M5 13.5h6.5l2.5-4h-3l-1.5-3H6.5z" fill="#0f172a" fillOpacity="0.85" />
      </svg>
      <span className="text-[0.7rem] font-extrabold leading-none tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] sm:text-xs">
        {SITE.name}
      </span>
    </div>
  );
}
