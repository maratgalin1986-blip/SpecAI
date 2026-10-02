import type { Metadata } from 'next';
import { prisma } from '@specai/database';
import { ProviderMap } from '@/components/ProviderMap';
import { loadMapPins } from '@/lib/providerMapData';
import type { ProviderMapPin } from '@/lib/providerMap';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Карта исполнителей — ${SITE.name}`,
  description:
    'Где стоит спецтехника в Набережных Челнах и по Татарстану: поставщики на карте, их цены и ' +
    'условия. Выберите ближайшего и оставьте заявку — это бесплатно.',
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
            Исполнители на карте
          </h1>
          <p className="max-w-2xl text-slate-600">
            Где стоит техника поставщиков: выберите ближайшего — подача быстрее и дешевле. Нажмите
            на значок, чтобы увидеть условия, технику поставщика и оставить заявку.
          </p>
          <div className="flex flex-wrap gap-2 text-sm font-semibold">
            <a
              href="/equipment"
              className="rounded-full border border-slate-300 px-4 py-2 hover:border-slate-900"
            >
              Каталог техники
            </a>
            <a
              href="/register?type=provider"
              className="rounded-full border border-slate-300 px-4 py-2 hover:border-slate-900"
            >
              Я сдаю технику — добавить себя на карту
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
