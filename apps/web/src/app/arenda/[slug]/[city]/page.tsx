import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CallbackForm } from '@/components/CallbackForm';
import { CinemaBand } from '@/components/CinemaBand';
import { CinemaLayer } from '@/components/CinemaHero';
import { MachineAmbience } from '@/components/MachineAmbience';
import { TelegramButton } from '@/components/TelegramButton';
import { TrustBadges } from '@/components/TrustBadges';
import {
  CITIES,
  cityBySlug,
  cityPages,
  cityPageText,
  cityPath,
  DELIVERY_NOTE,
  shiftExample,
} from '@/lib/cities';
import { landingClips } from '@/lib/landingClips';
import { landingLoop } from '@/lib/loops';
import { Reveal } from '@/components/Reveal';
import { landingBySlug } from '@/lib/landings';
import { rateOf, rub } from '@/lib/prices';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';

type Params = { slug: string; city: string };

export function generateStaticParams(): Params[] {
  return cityPages();
}

function resolve(params: Params) {
  const landing = landingBySlug(params.slug);
  const city = cityBySlug(params.city);
  return landing && city ? { landing, city } : null;
}

export function generateMetadata({ params }: { params: Params }): Metadata {
  const page = resolve(params);
  if (!page) return { title: 'Страница не найдена' };
  const text = cityPageText(page.landing, page.city);
  return {
    title: text.title,
    description: text.description,
    // The base city's page repeats the main landing: point search engines there.
    alternates: {
      canonical:
        page.city.slug === 'naberezhnye-chelny'
          ? `/arenda/${page.landing.slug}`
          : cityPath(page.landing.slug, page.city.slug),
    },
    openGraph: { title: text.title, description: text.description },
  };
}

export default function CityLandingPage({ params }: { params: Params }) {
  const page = resolve(params);
  if (!page) notFound();
  const { landing, city } = page;
  const machine = landing.machine;
  // «от …» and the example shift: lib/prices.ts only.
  const rate = rateOf(machine);
  const text = cityPageText(landing, city);
  const path = cityPath(landing.slug, city.slug);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Аренда ${landing.title} ${city.inCity}`,
    serviceType: `Аренда ${landing.title} с машинистом`,
    areaServed: { '@type': 'City', name: city.name },
    provider: {
      '@type': 'LocalBusiness',
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
            <p className="mt-5 text-3xl font-bold text-amber-400" data-testid="landing-price">
              от {rub(rate)} ₽
              <span className="text-base font-normal text-slate-300">/ч с машинистом</span>
            </p>
            <p className="mt-2 text-sm text-slate-300" data-testid="shift-example">
              Пример смены: {shiftExample(rate)}
            </p>
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
              subtitle={`${SITE.callbackPromise}.`}
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

      <TrustBadges />

      <section>
        <h2 className="text-2xl font-bold">Какие задачи решаем {city.inCity}</h2>
        <Reveal stagger className="mt-4 grid gap-3 sm:grid-cols-2">
          {landing.tasks.map((task) => (
            <div key={task} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              ✔ {task}
            </div>
          ))}
        </Reveal>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-xl font-bold">Сколько стоит {city.inCity}</h2>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          <li>
            ✔ Час работы — от {rub(rate)} ₽ с машинистом, смена — {shiftExample(rate)}
          </li>
          <li>✔ Оплата по фактически отработанным часам</li>
          <li>✔ Договор, счёт с НДС и закрывающие документы</li>
          <li>
            •{' '}
            {city.distanceKm === 0
              ? `Подача по городу — рассчитывается по адресу. ${DELIVERY_NOTE}`
              : `До города ${city.name} — около ${city.distanceKm} км от базы. ${DELIVERY_NOTE}`}
          </li>
        </ul>
      </section>

      <CinemaBand
        machine={machine}
        clip={landingLoop(landing.slug)}
        eyebrow={`Аренда ${landing.title} ${city.inCity}`}
        phrase="Скажите задачу — приедет машина и машинист"
      />

      <section className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          <span className="text-slate-500">{landing.short} в других городах:</span>
          {CITIES.filter((c) => c.slug !== city.slug).map((c) => (
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
          ← Аренда {landing.title}: вся информация и техника в наличии
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
