import type { Metadata } from 'next';
import { DemandMap } from '@/components/DemandMap';
import { OrderMap } from '@/components/OrderMap';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  // The layout's template adds «· ИИСтройка24 · СпецПласт16».
  title: 'Где нужна техника — отметьте на карте',
  description:
    'Отметьте на карте объект в Набережных Челнах или по Татарстану, выберите технику — ' +
    'диспетчер перезвонит и назовёт цену с подачей до этого места. Сервис бесплатный.',
  alternates: { canonical: '/map' },
};

export default function OrderMapPage({
  searchParams,
}: {
  searchParams: { embed?: string; layer?: string };
}) {
  // ?embed=1 — the app's «Карта» screen shows the page without the intro.
  const embed = searchParams.embed === '1';
  // ?layer=demand — the demand map (coloured circles per city, lib/demand.ts).
  const demand = searchParams.layer === 'demand';

  return (
    <div className="flex flex-col gap-5">
      {embed && (
        // Inside the app the site's header, footer and floating buttons are
        // hidden: the app has its own navigation.
        <style>{`body > *:not(main):not(script) { display: none !important; }
main { max-width: none !important; padding: 0 0 16px !important; }`}</style>
      )}
      {demand ? (
        <DemandMap embed={embed} />
      ) : (
        <>
          {!embed && (
            <header className="flex flex-col gap-2">
              <p className="eyebrow text-amber-700">Карта · {SITE.city} и Татарстан</p>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                Где нужна техника?
              </h1>
              <p className="max-w-2xl text-slate-600">
                Отметьте объект на карте, выберите технику и оставьте телефон — диспетчер перезвонит
                и назовёт точную цену с подачей до этого места. Хотите сравнить цены исполнителей —{' '}
                <a href="/orders" className="font-medium text-amber-700 underline">
                  оставьте заявку
                </a>
                , её увидят все, включая парк {SITE.name}.
              </p>
            </header>
          )}
          <OrderMap embed={embed} />
        </>
      )}
    </div>
  );
}
