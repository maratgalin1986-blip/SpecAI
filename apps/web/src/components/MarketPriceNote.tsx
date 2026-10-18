import { lookupPrice, rubles } from '@/lib/priceIndex';
import { loadPriceIndex } from '@/lib/priceIndexData';
import { SITE } from '@/lib/site';

/**
 * «Цены на рынке» on a city page: the median of other providers' hourly
 * prices for this kind of machinery in the city, else its region, else Russia
 * (lib/priceIndex.ts, ≥ 3 different companies or participants). Nothing at
 * all when there are too few — never an invented number.
 */
export async function MarketPriceNote({
  categorySlug,
  categoryLabel,
  city,
  region,
}: {
  categorySlug: string;
  categoryLabel: string;
  city: string;
  region: string;
}) {
  const { points, loaded } = await loadPriceIndex();
  if (!loaded) return null;
  const found = lookupPrice(points, categorySlug, { city, region });
  if (!found) return null;
  const where =
    found.scope === 'city'
      ? `в городе ${found.place}`
      : found.scope === 'region'
        ? `в регионе «${found.place}»`
        : 'по России';
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
      <h2 className="text-base font-bold text-slate-900">Цены на рынке</h2>
      <p className="mt-1">
        {categoryLabel} {where}: медиана {rubles(found.cell.median)}/ч с машинистом
        {found.cell.min !== null &&
          found.cell.max !== null &&
          found.cell.min !== found.cell.max &&
          `, обычно от ${rubles(found.cell.min)} до ${rubles(found.cell.max)}`}{' '}
        — по данным {found.cell.reporters} исполнителей, без парка {SITE.name}.{' '}
        <a href="/ceny" className="font-semibold text-amber-700 hover:underline">
          Все цены
        </a>
      </p>
    </section>
  );
}
