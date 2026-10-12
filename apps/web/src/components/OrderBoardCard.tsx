import { BID_NEEDS_PROVIDER_NOTE, bidLoginHref, type BoardCard } from '@/lib/orderBoard';

// One card of the public orders board (lib/orderBoard.ts decides the text).
// Graphite surfaces, one signal-orange action, as in the cabinets. Who looks
// decides the button: a provider bids, the author opens their order, anyone
// else is sent to sign in as a provider.

/** `public`: a cached page that knows no session — /orders/[id] sorts the viewer out. */
export type BoardViewer = 'guest' | 'customer' | 'provider' | 'owner' | 'public';

export function OrderBoardCard({
  card,
  viewer,
  compact = false,
}: {
  card: BoardCard;
  viewer: BoardViewer;
  compact?: boolean;
}) {
  const href = viewer === 'guest' || viewer === 'customer' ? bidLoginHref(card.id) : card.href;
  const action = viewer === 'owner' ? 'Моя заявка' : 'Предложить цену';
  return (
    <article
      className="cab-card flex h-full flex-col gap-3 transition hover:border-signal-400"
      data-order-card={card.id}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-2xl leading-none">
          {card.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-bold leading-tight text-graphite-950">
            {card.categoryName}
          </h3>
          <p className="mt-0.5 text-sm text-graphite-600">
            {card.place} · {card.dates} · {card.daysLabel}
          </p>
        </div>
        {card.urgent && (
          <span className="shrink-0 rounded-full bg-signal-500 px-2.5 py-0.5 text-xs font-bold text-graphite-950">
            нужна сейчас
          </span>
        )}
      </div>

      {!compact && card.excerpt && (
        <p className="text-sm leading-snug text-graphite-800">{card.excerpt}</p>
      )}

      <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="О заявке">
        <li className="cab-chip">{card.customer}</li>
        <li className="cab-chip">{card.createdAgo}</li>
        <li className={card.bidCount > 0 ? 'cab-chip border-graphite-900' : 'cab-chip'}>
          {card.bidsLabel}
        </li>
        {card.bidsLeft && (
          <li className="cab-chip border-signal-200 bg-signal-50 text-signal-800">
            {card.bidsLeft}
          </li>
        )}
        {card.sourceLabel && (
          <li className="cab-chip border-sky-200 bg-sky-50 text-sky-800">{card.sourceLabel}</li>
        )}
      </ul>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
        <a
          href={href}
          className={viewer === 'owner' ? 'cab-ghost' : 'cab-action'}
          data-order-action={viewer}
        >
          {action}
        </a>
        {viewer !== 'provider' && viewer !== 'owner' && (
          <span className="text-xs text-graphite-500">{BID_NEEDS_PROVIDER_NOTE}</span>
        )}
      </div>
    </article>
  );
}
