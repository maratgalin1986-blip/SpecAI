// Quiet product placement for СпецПласт16 (owner, 2026-10-03: «везде внедри
// скрытую рекламу», like placement in a film, never spam). Pure helpers so
// the rules are testable; components/BrandPresence.tsx wires them up.
import { SITE } from '@/lib/site';

/** The site's own address, written in the source line of long copied text. */
export const SITE_HOST = 'spec-ai-web.vercel.app';

/** Copied text of this length or shorter is left exactly as it was. */
export const COPY_MIN_CHARS = 200;

export const COPY_SOURCE_LINE = `— ${SITE.name}, ${SITE_HOST}`;

// Only digits and the characters of a phone number or a price list.
const PHONE_OR_PRICE_ONLY = /^[\s+()\-.,:;/0-9₽рубчасменсуткиот]*$/iu;

/**
 * The text to put on the clipboard: long copied passages get a short source
 * line; anything short, a phone number or a price is returned untouched, and
 * so is text that already carries the line.
 */
export function withCopySource(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= COPY_MIN_CHARS) return text;
  if (PHONE_OR_PRICE_ONLY.test(trimmed)) return text;
  if (trimmed.includes(SITE_HOST)) return text;
  return `${text.replace(/\s+$/, '')}\n\n${COPY_SOURCE_LINE}`;
}

/** Tab title while the visitor looks at another tab. */
export function awayTitle(pathname: string): string {
  if (/^\/stroyka(\/|$)/.test(pathname)) return `🏗️ Стройка ждёт · ${SITE.name}`;
  if (/^\/(smeta|kalkulyator|dizain)(\/|$)/.test(pathname)) {
    return `📐 Смета ждёт · ${SITE.name}`;
  }
  return `🚜 Экскаватор ждёт · ${SITE.name}`;
}

/** Pages where the tab title is never touched (staff tools, legal texts). */
export function keepsTitle(pathname: string): boolean {
  return /^\/(admin|provider|soglasie|privacy|tg)(\/|$)/.test(pathname);
}
