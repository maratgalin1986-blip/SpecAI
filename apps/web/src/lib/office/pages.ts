// Pure builders of the two office pages (R9, R10, R13). No database, no
// network: a prospect and a dictionary go in, the fields a component renders
// come out. Nothing here is invented — no reviews, prices, photos, ratings or
// numbers of any kind (R9); the texts come from the source card and the niche.
import type { MachineName, PageNiche, PageProspect } from './pageTypes';

export interface SitePage {
  title: string;
  eyebrow: string;
  hero: string;
  services: string[];
  address: string | null;
  hours: string | null;
  phone: string;
  /** `tel:+7…` */
  phoneHref: string;
  /** `https://wa.me/7…`, digits only. */
  whatsappHref: string;
  /** Yandex Maps by coordinates, else by address, else null. */
  mapHref: string | null;
  accent: PageNiche['accent'];
  city: string | null;
}

export interface ProviderPage {
  title: string;
  city: string | null;
  /** Names of the machine types; `['Спецтехника']` when the card names none. */
  machines: string[];
  /** The platform's order form with the city (and the type, when there is one). */
  orderHref: string;
  /** Provider sign-up with the card's data prefilled. */
  joinHref: string;
  /** Only once the company agreed (published); null before that (R13). */
  phone: string | null;
  phoneHref: string | null;
  address: string | null;
  hours: string | null;
}

/**
 * The digits of a Russian phone number in the international form without
 * «+»: «8 (927) 242-80-88» → «79272428088». A ten-digit local number gets
 * the country code; anything else is passed through as digits.
 */
export function phoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 10) return `7${digits}`;
  return digits;
}

function telHref(phone: string): string {
  return `tel:+${phoneDigits(phone)}`;
}

/** «+7 843 212-34-56» — как номер пишут люди; нестандартную длину оставляет как есть. */
export function phoneText(phone: string): string {
  const d = phoneDigits(phone);
  if (d.length !== 11) return phone;
  return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}

/** Yandex Maps: a point by coordinates, else a search by the address. */
export function mapHref(p: Pick<PageProspect, 'lat' | 'lon' | 'address'>): string | null {
  if (typeof p.lat === 'number' && typeof p.lon === 'number') {
    return `https://yandex.ru/maps/?pt=${p.lon},${p.lat}&z=16&l=map`;
  }
  const address = p.address?.trim();
  if (address) return `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`;
  return null;
}

/**
 * The hero line with the city put in as it is (nominative), e.g. a template
 * «… в городе {city}». Without a city the «в городе {city}» tail is dropped;
 * a template without a placeholder gets « · Город» appended.
 */
export function heroWithCity(heroLine: string, city: string | null): string {
  const trimmed = heroLine.trim();
  const cityName = city?.trim() || null;
  if (!trimmed.includes('{city}')) {
    return cityName ? `${trimmed} · ${cityName}` : trimmed;
  }
  if (cityName) return trimmed.replaceAll('{city}', cityName);
  return trimmed
    .replace(/\s*(?:в\s+городе|в\s+г\.|в)?\s*\{city\}/gi, '')
    .replace(/\s+([.,!?])/g, '$1')
    .trim();
}

export function buildSitePage(p: PageProspect, niche: PageNiche): SitePage {
  const city = p.city?.trim() || null;
  return {
    title: p.name.trim(),
    eyebrow: niche.title,
    hero: heroWithCity(niche.heroLine, city),
    services: [...niche.services],
    address: p.address?.trim() || null,
    hours: p.hours?.trim() || null,
    phone: phoneText(p.phone),
    phoneHref: telHref(p.phone),
    whatsappHref: `https://wa.me/${phoneDigits(p.phone)}`,
    mapHref: mapHref(p),
    accent: niche.accent,
    city,
  };
}

const GENERIC_MACHINES = ['Спецтехника'];

/** The machine-type slugs of a card: «ekskavator, avtokran» → ['ekskavator', 'avtokran']. */
export function tagSlugs(tags: string | null): string[] {
  if (!tags) return [];
  return [
    ...new Set(
      tags
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

export function buildProviderPage(
  p: PageProspect,
  machineNames: MachineName[],
  opts: { published: boolean },
): ProviderPage {
  const city = p.city?.trim() || null;
  const byName = new Map(machineNames.map((m) => [m.slug, m.name]));
  const known = tagSlugs(p.tags).filter((slug) => byName.has(slug));
  const machines = known.length
    ? known.map((slug) => byName.get(slug) as string)
    : GENERIC_MACHINES;

  const order = new URLSearchParams();
  if (city) order.set('city', city);
  const only = known.length === 1 ? known[0] : undefined;
  if (only) order.set('category', only);
  const orderQuery = order.toString();

  const join = new URLSearchParams({ role: 'provider', prospect: p.slug, name: p.name.trim() });
  // The phone goes into the sign-up link only with the company's consent:
  // before publication the page carries no phone anywhere (R13).
  if (opts.published) join.set('phone', `+${phoneDigits(p.phone)}`);
  if (city) join.set('city', city);

  return {
    title: p.name.trim(),
    city,
    machines: [...machines],
    orderHref: orderQuery ? `/orders?${orderQuery}` : '/orders',
    joinHref: `/register?${join.toString()}`,
    phone: opts.published ? phoneText(p.phone) : null,
    phoneHref: opts.published ? telHref(p.phone) : null,
    address: p.address?.trim() || null,
    hours: p.hours?.trim() || null,
  };
}

/** The banner over a preview page (R11). */
export function previewBannerText(p: Pick<PageProspect, 'name'>): string {
  return (
    `Предпросмотр: страница сделана для «${p.name.trim()}» агентом ИИСтройка24 ` +
    'и будет опубликована после согласия владельца компании'
  );
}
