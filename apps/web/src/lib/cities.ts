import type { Landing } from '@/lib/landings';
import { LANDINGS } from '@/lib/landings';
import { MACHINE_LABELS } from '@/lib/machinePhotos';
import { fromPrice, rateOf, rub, SHIFT_HOURS } from '@/lib/prices';

// Cities around the base in Набережные Челны where СпецПласт16 sends its own
// machines (/arenda/<slug>/<city>). Only certain facts live here: the name,
// its grammatical forms and the approximate road distance from the base.
// No delivery prices: «стоимость подачи назовёт диспетчер».

export interface City {
  slug: string;
  /** «Елабуга» */
  name: string;
  /** «в Елабуге» */
  inCity: string;
  /** «по Елабуге» */
  around: string;
  /** Approximate road distance from the base in Набережные Челны, km; 0 for the base city. */
  distanceKm: number;
}

export const BASE_CITY_SLUG = 'naberezhnye-chelny';

export const CITIES: City[] = [
  {
    slug: BASE_CITY_SLUG,
    name: 'Набережные Челны',
    inCity: 'в Набережных Челнах',
    around: 'по Набережным Челнам',
    distanceKm: 0,
  },
  { slug: 'elabuga', name: 'Елабуга', inCity: 'в Елабуге', around: 'по Елабуге', distanceKm: 25 },
  {
    slug: 'nizhnekamsk',
    name: 'Нижнекамск',
    inCity: 'в Нижнекамске',
    around: 'по Нижнекамску',
    distanceKm: 40,
  },
  {
    slug: 'mendeleevsk',
    name: 'Менделеевск',
    inCity: 'в Менделеевске',
    around: 'по Менделеевску',
    distanceKm: 30,
  },
];

/** The cities other than the base, for «Работаем также: …». */
export const NEARBY_CITIES = CITIES.filter((city) => city.slug !== BASE_CITY_SLUG);

export const DELIVERY_NOTE = 'Стоимость подачи назовёт диспетчер.';

export function cityBySlug(slug: string): City | undefined {
  return CITIES.find((city) => city.slug === slug);
}

export function cityPath(landingSlug: string, citySlug: string): string {
  return `/arenda/${landingSlug}/${citySlug}`;
}

/** Every landing × city pair, for generateStaticParams and the sitemap. */
export function cityPages(): { slug: string; city: string }[] {
  return LANDINGS.flatMap((landing) =>
    CITIES.map((city) => ({ slug: landing.slug, city: city.slug })),
  );
}

/** «база в городе» or «около 25 км от базы в Набережных Челнах». */
export function distanceText(city: City): string {
  return city.distanceKm === 0
    ? 'база СпецПласт16 — в самом городе'
    : `около ${city.distanceKm} км по дороге от базы в Набережных Челнах`;
}

/** «8 ч × 4 000 ₽ = 32 000 ₽» — hours × rate, computed, never typed by hand. */
export function shiftExample(rate: number, hours: number = SHIFT_HOURS): string {
  return `${hours}\u00a0ч × ${rub(rate)}\u00a0₽ = ${rub(rate * hours)}\u00a0₽`;
}

const lower = (text: string) => `${text[0]!.toLowerCase()}${text.slice(1)}`;

/**
 * Two tasks of the machine for this city: the list is rotated by the city's
 * position, so pages of one machine do not repeat the same sentence.
 */
function tasksFor(landing: Landing, city: City): string[] {
  const shift = Math.max(0, CITIES.indexOf(city));
  const tasks = landing.tasks;
  if (tasks.length <= 2) return tasks;
  return [tasks[shift % tasks.length]!, tasks[(shift + 1) % tasks.length]!];
}

export interface CityPageText {
  h1: string;
  title: string;
  description: string;
  intro: string;
}

/** The unique heading, title, description and intro of /arenda/<slug>/<city>. */
export function cityPageText(landing: Landing, city: City): CityPageText {
  const rate = rateOf(landing.machine);
  const machine = MACHINE_LABELS[landing.machine];
  const tasks = tasksFor(landing, city).map(lower).join('; ');
  const where =
    city.distanceKm === 0
      ? `${machine} выезжает с базы СпецПласт16 ${city.inCity}, без перегона из другого города.`
      : `${city.name} — ${distanceText(city)}: ${lower(machine)} СпецПласт16 выезжает на объект ${city.inCity} из собственного парка.`;
  return {
    h1: `Аренда ${landing.title} ${city.inCity} с машинистом`,
    title: `Аренда ${landing.title} ${city.inCity} — ${fromPrice(rate)} с машинистом`,
    description:
      `${landing.short} СпецПласт16 ${city.around}: ${fromPrice(rate)} с машинистом, ` +
      `смена ${SHIFT_HOURS} ч — от ${rub(rate * SHIFT_HOURS)} ₽. ${DELIVERY_NOTE}`,
    intro: `${where} Например: ${tasks}. ${DELIVERY_NOTE}`,
  };
}
