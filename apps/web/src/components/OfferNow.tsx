'use client';

import { useEffect, useState } from 'react';
import { categoryEmoji } from '@specai/shared';
import { allowedVisitorFix } from '@/components/visitorPosition';
import { distanceKm } from '@/lib/geo';
import { HOUSE_SERVES_KM, NOBODY_ON_LINE, OFFER_LINE_MAX, type OfferCard } from '@/lib/offerNow';
import { requestOrderPrefill } from '@/lib/orderPrefillEvent';
import { SITE } from '@/lib/site';

/**
 * Above the order form (owner, 2026-10-18): СпецПласт16's free machines with
 * their prices first, then the machines on the line now; «Заказать» fills the
 * form below (lib/orderPrefillEvent.ts) and moves to it. The nearest machines
 * on the line come first when the browser already knows where the visitor is
 * (nothing is asked here); a visitor that far from every СпецПласт16 machine
 * (HOUSE_SERVES_KM) sees the machines on the line first — the house fleet
 * leads where it serves. Nothing is invented: with nobody on the line it says so.
 */
export function OfferNow({
  house,
  line,
  formAnchor,
  dark = false,
}: {
  house: OfferCard[];
  line: OfferCard[];
  /** The id of the form this block fills («callback», «new»). */
  formAnchor: string;
  dark?: boolean;
}) {
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void allowedVisitorFix().then((fix) => {
      if (alive && fix) setMe({ lat: fix.lat, lon: fix.lon });
    });
    return () => {
      alive = false;
    };
  }, []);

  const away = (card: OfferCard) => (me && card.near ? distanceKm(me, card.near) : Infinity);
  // Machines without a known city keep their place after the located ones.
  const shownLine = (me ? [...line].sort((a, b) => away(a) - away(b)) : line).slice(
    0,
    OFFER_LINE_MAX,
  );
  const houseFar = Boolean(me) && house.every((card) => away(card) > HOUSE_SERVES_KM);

  function order(card: OfferCard) {
    requestOrderPrefill({ categorySlug: card.categorySlug, text: card.prefill });
    const form = document.getElementById(formAnchor);
    form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const muted = dark ? 'text-slate-300' : 'text-slate-600';
  const heading = `text-sm font-bold uppercase tracking-wide ${dark ? 'text-amber-400' : 'text-amber-700'}`;

  const card = (item: OfferCard) => {
    const km = me && item.near ? Math.round(distanceKm(me, item.near)) : null;
    const where = [item.who, item.city].filter(Boolean).join(' · ');
    const emoji = categoryEmoji({ slug: item.categorySlug }) ?? '🚜';
    return (
      <li
        key={item.id}
        className={`flex w-60 shrink-0 snap-start flex-col justify-between gap-2 rounded-2xl p-3 text-sm ring-1 ${
          dark
            ? 'bg-slate-900/70 text-white ring-white/15'
            : 'bg-white text-slate-900 ring-slate-200'
        }`}
      >
        <div className="min-w-0">
          <p className="line-clamp-2 font-semibold leading-snug">
            <span aria-hidden>{emoji} </span>
            {item.name}
          </p>
          <p className={`mt-1 text-xs ${muted}`}>
            {item.live && (
              <span className="mr-1 inline-flex items-center gap-1 font-semibold text-emerald-500">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
                />
                на линии ·
              </span>
            )}
            {where}
            {km !== null && `${where ? ' · ' : ''}≈ ${km.toLocaleString('ru-RU')} км`}
          </p>
          <p className="mt-1 font-bold">{item.price}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => order(item)}
            className="inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-amber-500 px-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400"
          >
            Заказать
          </button>
          <a
            href={`/equipment/${encodeURIComponent(item.id)}`}
            className={`text-xs underline underline-offset-2 ${muted}`}
          >
            Подробнее
          </a>
        </div>
      </li>
    );
  };

  return (
    <div id="offer-now" data-offer-now className="flex scroll-mt-24 flex-col gap-4">
      {house.length > 0 && (
        <div className={`flex flex-col gap-2 ${houseFar ? 'order-last' : ''}`}>
          <h3 className={heading}>Свободная техника {SITE.name}</h3>
          <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">{house.map(card)}</ul>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h3 className={heading}>Сейчас на линии</h3>
        {shownLine.length > 0 ? (
          <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {shownLine.map(card)}
          </ul>
        ) : (
          <p className={`text-sm ${muted}`}>{NOBODY_ON_LINE}</p>
        )}
      </div>
    </div>
  );
}
