// Deep links into the СпецПласт16 Telegram bot. The start parameter carries
// where the visitor came from (page + ad campaign), so the bot can save it
// with the lead. Telegram allows 1–64 characters of [A-Za-z0-9_-].

import { SITE } from '@/lib/site';

const START_MAX = 64;

/** A safe start parameter: «arenda-samosval__direct-kran». */
export function startParam(page: string, campaign?: string | null): string {
  const clean = (value: string) =>
    value
      .toLowerCase()
      .replace(/^\/+|\/+$/g, '')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');
  const p = clean(page) || 'home';
  const c = campaign ? clean(campaign) : '';
  return (c ? `${p}__${c}` : p).slice(0, START_MAX).replace(/[-_]+$/, '') || 'site';
}

/** Adds a Yandex Direct click id («__y<digits>») when it still fits. */
export function withYclid(param: string, yclid?: string | null): string {
  const digits = (yclid ?? '').replace(/\D/g, '');
  if (!digits) return param;
  const next = `${param}__y${digits}`;
  return next.length <= START_MAX ? next : param;
}

/** Splits a start parameter back into the page, the campaign and the yclid. */
export function parseStart(param: string | undefined | null): {
  page: string;
  campaign: string;
  yclid: string;
} {
  const value = (param ?? '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) return { page: '', campaign: '', yclid: '' };
  const parts = value.split('__');
  const y = parts.findIndex((part, i) => i > 0 && /^y\d+$/.test(part));
  const yclid = y > 0 ? parts.splice(y, 1)[0]!.slice(1) : '';
  return { page: parts[0] ?? '', campaign: parts[1] ?? '', yclid };
}

/** https://t.me/<bot>?start=<param> */
export function telegramLink(param?: string): string {
  const base = `https://t.me/${SITE.telegramBot}`;
  return param ? `${base}?start=${param}` : base;
}

/** The Mini App link (opened by Telegram inside the bot). */
export function miniAppLink(param?: string): string {
  return `https://t.me/${SITE.telegramBot}/app${param ? `?startapp=${param}` : ''}`;
}
