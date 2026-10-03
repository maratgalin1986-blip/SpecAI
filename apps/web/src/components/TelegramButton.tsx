'use client';

import { useEffect, useState } from 'react';
import { currentYclid, reachGoal } from '@/lib/marketing';
import { startParam, telegramLink, withYclid } from '@/lib/telegram';

const CAMPAIGN_KEY = 'sp16_tg_campaign';

/** Remembers utm_campaign and yclid of the landing visit for later pages. */
function campaignOf(): { campaign: string; yclid: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    const fresh = { campaign: params.get('utm_campaign') ?? '', yclid: params.get('yclid') ?? '' };
    if (fresh.campaign || fresh.yclid) {
      sessionStorage.setItem(CAMPAIGN_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const saved = JSON.parse(sessionStorage.getItem(CAMPAIGN_KEY) ?? 'null') as {
      campaign: string;
      yclid: string;
    } | null;
    // A later visit still carries the Direct click remembered for 30 days.
    return { campaign: saved?.campaign ?? '', yclid: saved?.yclid || currentYclid() };
  } catch {
    return { campaign: '', yclid: '' };
  }
}

/** The deep link for this page, computed in the browser (page + campaign + yclid). */
export function useTelegramLink(page?: string): string {
  const [href, setHref] = useState(() => telegramLink(startParam(page ?? 'site')));
  useEffect(() => {
    const { campaign, yclid } = campaignOf();
    setHref(telegramLink(withYclid(startParam(page ?? window.location.pathname, campaign), yclid)));
  }, [page]);
  return href;
}

/**
 * «Открыть в Telegram»: one tap to the СпецПласт16 bot, which knows where the
 * visitor came from. Counts the telegram_click goal.
 */
export function TelegramButton({
  page,
  label = 'Открыть в Telegram',
  className = '',
  dark = false,
}: {
  page?: string;
  label?: string;
  className?: string;
  dark?: boolean;
}) {
  const href = useTelegramLink(page);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      data-telegram-link
      onClick={() => reachGoal('telegram_click')}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition ${
        dark
          ? 'bg-[#2aabee] text-white hover:bg-[#229ed9]'
          : 'bg-[#2aabee] text-white shadow-sm hover:bg-[#229ed9]'
      } ${className}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-current">
        <path d="M9.8 15.3 9.6 19c.4 0 .6-.2.8-.4l2-1.9 4.1 3c.8.4 1.3.2 1.5-.7l2.7-12.7c.3-1.1-.4-1.6-1.2-1.3L3.7 10.4c-1.1.4-1.1 1-.2 1.3l4.1 1.3 9.6-6c.5-.3.9-.1.5.2" />
      </svg>
      {label}
    </a>
  );
}
