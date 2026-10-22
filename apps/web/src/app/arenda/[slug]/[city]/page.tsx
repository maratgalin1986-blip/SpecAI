import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card } from '@specai/ui';
import { CallbackForm } from '@/components/CallbackForm';
import { CinemaBand } from '@/components/CinemaBand';
import { CinemaLayer } from '@/components/CinemaHero';
import { MachineAmbience } from '@/components/MachineAmbience';
import { MarketPriceNote } from '@/components/MarketPriceNote';
import { TelegramButton } from '@/components/TelegramButton';
import { TrustBadges } from '@/components/TrustBadges';
import {
  cityBySlug,
  cityPageText,
  cityPath,
  DELIVERY_NOTE,
  firstOnLineInvite,
  HOUSE_CITIES,
  joiningText,
  nearestCities,
  shiftExample,
} from '@/lib/cities';
import { loadCityOffer } from '@/lib/cityFleetData';
import { landingClips } from '@/lib/landingClips';
import { landingLoop } from '@/lib/loops';
import { Reveal } from '@/components/Reveal';
import { LANDINGS, landingBySlug } from '@/lib/landings';
import { rub, SHIFT_HOURS } from '@/lib/prices';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';

type Params = { slug: string; city: string };

// Machines and prices follow the providers' fleets: refreshed every 10 minutes
// (a page built while the database was unreachable does not stay long). The
// cities of СпецПласт16's own area are built ahead; the rest of Russia on the
// first visit (dynamicParams), then cached the same way.
export const revalidate = 600;

export function generateStaticParams(): Params[] {
  return LANDINGS.flatMap((landing) =>
    HOUSE_CITIES.map((city) => ({ slug: landing.slug, city: city.slug })),
  );
}

function resolve(params: Params) {
  const landing = landingBySlug(params.slug);
  const city = cityBySlug(params.city);
  return landing && city ? { landing, city } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = resolve(params);
  if (!page) return { title: 'Страница не найдена' };
  const offer = await loadCityOffer(page.landing, page.city);
  const text = cityPageText(page.landing, page.city, offer);
  const path = cityPath(page.landing.slug, page.city.slug);
  return {
    title: text.title,
    description: text.description,
    alternates: { canonical: path },
    openGraph: { title: text.title, description: text.description, url: path },
    // A city nobody serves yet stays out of search: a thousand near-identical
    // «исполнители подключаются» pages read as doorways to Яндекс. It opens to
    // search by itself once a provider serves the city.
    ...(offer.kind === 'empty' ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CityLandingPage({ params }: { params: Params }) {
  const page = resolve(params);
  if (!page) notFound();
  const { landing, city } = page;
  const machine = landing.machine;
  const offer = await loadCityOffer(landing, city);
  const text = cityPageText(landing, city, offer);
  const path = cityPath(landing.slug, city.slug);
  const invite = firstOnLineInvite(city);
  // «от …» and the example shift: the lowest rate of the machines that serve
  // this city (СпецПласт16's list price where its fleet goes), never invented.
  const rate = offer.kind === 'available' ? offer.fromRate : null;
  const machines = offer.kind === 'available' ? offer.machines : [];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Аренда ${landing.title} ${city.inCity}`,
    serviceType: `Аренда ${landing.title} с машинистом`,
    areaServed: {
      '@type': 'City',
      name: city.name,
      ...(city.region !== city.name
        ? { containedInPlace: { '@type': 'AdministrativeArea', name: city.region } }
        : {}),
    },
    // The operator of the platform (СпецПласт16, Набережные Челны).
    provider: {
      '@type': 'Organization',
      name: SITE.legalName || SITE.name,
      telephone: SITE.phone,
      address: {
        '@type': 'PostalAddress',
        addressLocality: SITE.city,
        addressRegion: SITE.region,
        addressCountry: 'RU',
      },
    },
    url: `${siteUrl()}${path}`,
    ...(rate !== null
      ? {
          offers: {
            '@type': 'Offer',
            priceCurrency: 'RUB',
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              price: rate,
              priceCurrency: 'RUB',
              unitText: 'час',
            },
          },
        }
      : {}),
  };

  return (
    <div className="flex flex-col gap-12">
      <MachineAmbience type={machine} />
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-10 text-white shadow-2xl sm:px-10 sm:py-14">
        <CinemaLayer clips={landingClips(landing.slug)} />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="flex min-w-0 flex-col justify-center">
            <nav className="text-sm text-slate-400">
              <a href="/" className="hover:text-white">
                Главная
              </a>{' '}
              /{' '}
              <a href={`/arenda/${landing.slug}`} className="hover:text-white">
                {landing.short}
              </a>{' '}
              / <span>{city.name}</span>
            </nav>
            <h1 className="cine-title mt-3 break-words text-3xl font-extrabold leading-tight sm:text-5xl">
              {text.h1}
            </h1>
            <p className="mt-4 text-slate-300" data-testid="city-intro">
              {text.intro}
            </p>
            {rate !== null ? (
              <>
                <p className="mt-5 text-3xl font-bold text-amber-400" data-testid="landing-price">
                  от {rub(rate)} ₽
                  <span className="text-base font-normal text-slate-300">/ч с машинистом</span>
                </p>
                <p className="mt-2 text-sm text-slate-300" data-testid="shift-example">
                  Пример смены: {shiftExample(rate)}
                </p>
              </>
            ) : (
              offer.kind === 'empty' && (
                <p className="mt-5 text-xl font-bold text-amber-400" data-testid="city-joining">
                  {joiningText(city)}
                </p>
              )
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={SITE.phoneHref}
                className="sweep rounded-md bg-amber-500 px-5 py-3 font-semibold text-slate-950 hover:bg-amber-400"
              >
                {SITE.phone}
              </a>
              <TelegramButton page={path} dark />
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Заявки обрабатываем по{' '}
              <a href="/privacy" className="underline hover:text-white">
                политике конфиденциальности
              </a>
              .
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 backdrop-blur">
            <CallbackForm
              source={`landing:${landing.slug}:${city.slug}`}
              defaultMessage={`Нужна аренда ${landing.title} ${city.inCity}`}
              title={offer.kind === 'empty' ? 'Заявка на технику' : undefined}
              subtitle={
                offer.kind === 'empty'
                  ? `Оставьте телефон и задачу — найдём исполнителя ${city.inCity} и перезвоним.`
                  : `${SITE.callbackPromise}.`
              }
              dark
            />
            <p className="mt-3 text-xs text-slate-400">
              <a href="/privacy" className="underline hover:text-white">
                Политика конфиденциальности
              </a>
            </p>
          </div>
        </div>
      </section>

      {offer.kind === 'available' && <TrustBadges />}

      {machines.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold">Техника исполнителей {city.inCity} и рядом</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {machines.slice(0, 12).map((item) => (
              <a key={item.id} href={`/equipment/${item.id}`}>
                <Card className="flex h-full flex-col gap-2 hover:border-amber-400">
                  <h3 className="font-semibold">{item.name}</h3>
                  {item.isHouse && <p className="text-sm text-slate-500">Парк {SITE.name}</p>}
                  {item.hourlyRate > 0 && (
                    <p className="mt-auto text-lg font-semibold" data-testid="fleet-card-price">
                      от {rub(item.hourlyRate)} ₽
                      <span className="text-sm font-normal text-slate-500">/ч с машинистом</span>
                    </p>
                  )}
                  {item.shiftRate > 0 && (
                    <p className="text-sm text-slate-600" data-testid="fleet-card-shift">
                      смена {SHIFT_HOURS}&nbsp;ч — от {rub(item.shiftRate)}&nbsp;₽
                    </p>
                  )}
                </Card>
              </a>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-bold">
          {offer.kind === 'empty'
            ? `Что можно заказать ${city.inCity}`
            : `Какие задачи решаем ${city.inCity}`}
        </h2>
        <Reveal stagger className="mt-4 grid gap-3 sm:grid-cols-2">
          {landing.tasks.map((task) => (
            <div key={task} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              ✔ {task}
            </div>
          ))}
        </Reveal>
      </section>

      {offer.kind === 'empty' ? (
        <section
          className="rounded-2xl border border-amber-200 bg-amber-50 p-6"
          data-testid="city-empty"
        >
          <h2 className="text-xl font-bold">Как это работает {city.inCity}</h2>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            <li>✔ Оставьте заявку: задача, адрес объекта и сроки</li>
            <li>✔ Её увидят диспетчер площадки и исполнители, которые выезжают к вам</li>
            <li>✔ Они пришлют цены — машину и предложение выбираете вы</li>
            <li>✔ Для заказчика сервис бесплатный, без комиссий</li>
          </ul>
          <a
            href="/orders"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-amber-700 px-5 text-sm font-bold text-white transition-colors hover:bg-amber-800"
          >
            Разместить заявку для исполнителей
          </a>
          <div className="mt-5 border-t border-amber-200 pt-4" data-testid="city-first-on-line">
            <h3 className="font-bold">{invite.title}</h3>
            <p className="mt-1 text-sm text-slate-700">{invite.text}</p>
            <a
              href={invite.href}
              className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md bg-slate-900 px-5 text-sm font-bold text-white ring-2 ring-emerald-400/70 transition-colors hover:bg-slate-800"
            >
              🚛 Встать на линию первым
            </a>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-bold">Сколько стоит {city.inCity}</h2>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {rate !== null && (
              <li>
                ✔ Час работы — от {rub(rate)} ₽ с машинистом, смена — {shiftExample(rate)}
              </li>
            )}
            <li>✔ Оплата по фактически отработанным часам</li>
            {offer.houseServes && (
              <li>✔ У {SITE.name} — договор, счёт с НДС и закрывающие документы</li>
            )}
            <li>
              •{' '}
              {city.houseKm === 0
                ? `Подача по городу — рассчитывается по адресу. ${DELIVERY_NOTE}`
                : offer.houseServes && city.houseKm !== undefined
                  ? `До города ${city.name} — около ${city.houseKm} км от базы ${SITE.name}. ${DELIVERY_NOTE}`
                  : `Подача — от базы исполнителя до вашего объекта. ${DELIVERY_NOTE}`}
            </li>
          </ul>
        </section>
      )}

      {/* Awaited as a call, like ProviderOpsSection: the JSX types stay simple. */}
      {await MarketPriceNote({
        categorySlug: landing.categorySlug,
        categoryLabel: landing.short,
        city: city.name,
        region: city.region,
      })}

      <CinemaBand
        machine={machine}
        clip={landingLoop(landing.slug)}
        eyebrow={`Аренда ${landing.title} ${city.inCity}`}
        phrase={
          offer.kind === 'empty'
            ? 'Опишите задачу — найдём машину и машиниста'
            : 'Скажите задачу — приедет машина и машинист'
        }
      />

      <section className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          <span className="text-slate-500">{landing.short} рядом:</span>
          {nearestCities(city).map((c) => (
            <a
              key={c.slug}
              href={cityPath(landing.slug, c.slug)}
              className="inline-flex min-h-[44px] items-center text-amber-700 hover:underline"
            >
              {c.name}
            </a>
          ))}
        </div>
        <a
          href={`/arenda/${landing.slug}`}
          className="inline-flex min-h-[44px] items-center text-amber-700 hover:underline"
        >
          ← Аренда {landing.title}: все города и техника
        </a>
        <a
          href="/raboty"
          className="inline-flex min-h-[44px] items-center text-amber-700 hover:underline"
        >
          Работы и цены: траншеи, котлованы, снег, демонтаж →
        </a>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
