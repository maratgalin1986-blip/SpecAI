import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CallbackForm } from '@/components/CallbackForm';
import { CinemaLayer } from '@/components/CinemaHero';
import { TelegramButton } from '@/components/TelegramButton';
import { TrustBadges } from '@/components/TrustBadges';
import { CITIES, cityPath, DELIVERY_NOTE, NEARBY_CITIES, shiftExample } from '@/lib/cities';
import {
  JOBS,
  jobBySlug,
  jobLanding,
  jobMachineLabel,
  jobMachineRate,
  jobRate,
  type Job,
} from '@/lib/jobs';
import { landingClips } from '@/lib/landingClips';
import { fromPrice, rub, SHIFT_HOURS } from '@/lib/prices';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';

export function generateStaticParams() {
  return JOBS.map((job) => ({ slug: job.slug }));
}

function jobTitle(job: Job) {
  return `${job.name} в Набережных Челнах — ${fromPrice(jobRate(job))} с машинистом`;
}

function jobDescription(job: Job) {
  return `${job.short} Техника СпецПласт16 ${fromPrice(jobRate(job))} с машинистом, пример смены: ${shiftExample(jobRate(job))}. ${DELIVERY_NOTE}`;
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const job = jobBySlug(params.slug);
  if (!job) return { title: 'Страница не найдена' };
  const title = jobTitle(job);
  const description = jobDescription(job);
  return {
    title,
    description,
    alternates: { canonical: `/raboty/${job.slug}` },
    openGraph: { title, description },
  };
}

export default function JobPage({ params }: { params: { slug: string } }) {
  const job = jobBySlug(params.slug);
  if (!job) notFound();
  const landing = jobLanding(job);
  if (!landing) notFound();
  const rate = jobRate(job);
  const path = `/raboty/${job.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: job.name,
    serviceType: `${job.name} спецтехникой с машинистом`,
    description: job.short,
    areaServed: CITIES.map((city) => ({ '@type': 'City', name: city.name })),
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
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-10 text-white shadow-2xl sm:px-10 sm:py-14">
        <CinemaLayer clips={landingClips(landing.slug)} />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="flex min-w-0 flex-col justify-center">
            <nav className="text-sm text-slate-400">
              <a href="/" className="hover:text-white">
                Главная
              </a>{' '}
              /{' '}
              <a href="/raboty" className="hover:text-white">
                Работы и цены
              </a>{' '}
              / <span>{job.name}</span>
            </nav>
            <h1 className="cine-title mt-3 break-words text-3xl font-extrabold leading-tight sm:text-5xl">
              {job.name} в Набережных Челнах
            </h1>
            <p className="mt-4 text-slate-300">{job.short}</p>
            <p className="mt-5 text-3xl font-bold text-amber-400" data-testid="job-price">
              от {rub(rate)} ₽
              <span className="text-base font-normal text-slate-300">/ч с машинистом</span>
            </p>
            <p className="mt-2 text-sm text-slate-300" data-testid="shift-example">
              Пример смены: {shiftExample(rate)}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={SITE.phoneHref}
                className="rounded-md bg-amber-500 px-5 py-3 font-semibold text-slate-950 hover:bg-amber-400"
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
              source={`job:${job.slug}`}
              defaultMessage={`${job.name}: нужна техника`}
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

      <section>
        <h2 className="text-2xl font-bold">Как проходит работа</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {job.steps.map((step, i) => (
            <li
              key={step}
              className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-slate-950">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Какая техника и сколько стоит</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {job.machines.map((machine) => {
            const machineRate = jobMachineRate(machine);
            return (
              <a
                key={`${machine.type}-${machine.role}`}
                href={`/arenda/${machine.landing}`}
                className="flex h-full flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 hover:border-amber-400"
              >
                <h3 className="font-semibold">{jobMachineLabel(machine)}</h3>
                <p className="text-sm text-slate-500">{machine.role}</p>
                <p className="mt-auto text-lg font-semibold" data-testid="job-machine-price">
                  {fromPrice(machineRate)}
                  <span className="text-sm font-normal text-slate-500"> с машинистом</span>
                </p>
                <p className="text-sm text-slate-600">Смена: {shiftExample(machineRate)}</p>
                <span className="text-sm font-medium text-amber-700">Подробнее о технике →</span>
              </a>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Пример — одна смена, {SHIFT_HOURS} часов; платите за фактически отработанные часы.{' '}
          {DELIVERY_NOTE}
        </p>
      </section>

      <TrustBadges />

      <section className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          <span className="text-slate-500">Работаем также:</span>
          {NEARBY_CITIES.map((city) => (
            <a
              key={city.slug}
              href={cityPath(landing.slug, city.slug)}
              className="text-amber-700 hover:underline"
            >
              {city.name}
            </a>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          <span className="text-slate-500">Другие работы:</span>
          {JOBS.filter((j) => j.slug !== job.slug).map((j) => (
            <a key={j.slug} href={`/raboty/${j.slug}`} className="text-amber-700 hover:underline">
              {j.name}
            </a>
          ))}
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
