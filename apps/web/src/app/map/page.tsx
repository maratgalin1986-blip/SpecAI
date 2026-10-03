import type { Metadata } from 'next';
import { prisma } from '@specai/database';
import { ProviderMap } from '@/components/ProviderMap';
import { loadMapPins } from '@/lib/providerMapData';
import type { ProviderMapPin } from '@/lib/providerMap';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  // The layout's template adds «· ИИСтройка24 · СпецПласт16».
  title: 'Наша техника на карте',
  description:
    'Где стоит техника СпецПласт16 в Набережных Челнах и по Татарстану: наш парк, наши ' +
    'машинисты, одна цена от диспетчера. Оставьте заявку — перезвоним и назовём цену с подачей.',
  alternates: { canonical: '/map' },
};

export default async function ProviderMapPage({
  searchParams,
}: {
  searchParams: { embed?: string };
}) {
  let pins: ProviderMapPin[] = [];
  let unavailable = false;
  try {
    pins = await loadMapPins(prisma);
  } catch (error) {
    console.error('[map] failed to load providers', error);
    unavailable = true;
  }
  // ?embed=1 — the app's «Карта» screen shows the page without the intro.
  const embed = searchParams.embed === '1';

  return (
    <div className="flex flex-col gap-5">
      {embed && (
        // Inside the app the site's header, footer and floating buttons are
        // hidden: the app has its own navigation.
        <style>{`body > *:not(main):not(script) { display: none !important; }
main { max-width: none !important; padding: 0 0 16px !important; }`}</style>
      )}
      {!embed && (
        <header className="flex flex-col gap-2">
          <p className="eyebrow text-amber-700">Карта · {SITE.city} и Татарстан</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Наша техника на карте
          </h1>
          <p className="max-w-2xl text-slate-600">
            Где стоит парк {SITE.name}: наши машины и наши машинисты, одна цена от диспетчера — с
            подачей. Нажмите на значок, чтобы увидеть технику и оставить заявку.
          </p>
          <div className="flex flex-wrap gap-2 text-sm font-semibold">
            <a
              href="/equipment"
              className="rounded-full border border-slate-300 px-4 py-2 hover:border-slate-900"
            >
              Каталог техники
            </a>
          </div>
        </header>
      )}
      {unavailable ? (
        <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">
          Карта временно недоступна, попробуйте обновить страницу через минуту.
        </p>
      ) : (
        <ProviderMap pins={pins} embed={embed} />
      )}
    </div>
  );
}
