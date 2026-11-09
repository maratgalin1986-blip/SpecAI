import type { Metadata } from 'next';
import { Faq } from '@/components/Faq';
import { ExampleCards } from '@/components/office/landing/ExampleCards';
import { PackageCards } from '@/components/office/landing/PackageCards';
import { SiteMockup } from '@/components/office/landing/SiteMockup';
import { SiteRequestForm } from '@/components/office/landing/SiteRequestForm';
import {
  DEMO_CITY,
  LANDING_EXAMPLES_ANCHOR,
  LANDING_FORM_ANCHOR,
  LANDING_INCLUDES,
  LANDING_PATH,
  LANDING_STEPS,
  landingExamples,
  landingFaq,
  packagePriceLine,
  serviceJsonLd,
  type LandingPriceBase,
} from '@/lib/office/landing';
import { officePrices, parseOfficePrices } from '@/lib/office/prices';
import { sitePackages } from '@/lib/prices';
import { jsonLdScript } from '@/lib/providerSeo';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';

// «Сайт под ключ» (S2): страница самой услуги — на неё ведут письма кандидатам и подвал
// каждого клиентского сайта («Хотите такой же?»). Не в главном меню, индексируется.
// Цены — из настроек офиса (officePrices → sitePackages); база недоступна — цены по
// умолчанию из lib/prices.ts, страница не падает.

export const revalidate = 600;

const TITLE = 'Сайт для бизнеса под ключ — сначала покажем, потом решаете';
const DESCRIPTION =
  'Соберём сайт для компании по данным её карточки на карте: услуги, адрес, часы работы, кнопки ' +
  '«Позвонить» и WhatsApp, форма заявки на почту. Сначала бесплатно покажем готовый сайт, решаете потом. ' +
  'Можно на своём домене.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: LANDING_PATH },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    title: TITLE,
    description: DESCRIPTION,
    url: LANDING_PATH,
  },
};

async function loadPrices(): Promise<LandingPriceBase> {
  try {
    return await officePrices();
  } catch {
    return parseOfficePrices([]);
  }
}

const FORM_HREF = `#${LANDING_FORM_ANCHOR}`;
const EXAMPLES_HREF = `#${LANDING_EXAMPLES_ANCHOR}`;

function SectionTitle({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="eyebrow text-amber-700">{eyebrow}</p>
      <h2 id={id} className="text-2xl font-extrabold tracking-[-0.02em] text-slate-900 sm:text-4xl">
        {title}
      </h2>
    </div>
  );
}

export default async function SiteServicePage() {
  const base = await loadPrices();
  const packages = sitePackages(base);
  const examples = landingExamples();
  const mockup = examples.find((e) => e.key === 'dentist') ?? examples[0];
  const first = packages[0];
  const url = `${siteUrl()}${LANDING_PATH}`;

  return (
    <article className="flex flex-col gap-16 pb-8 text-slate-700 sm:gap-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(serviceJsonLd(base, url)) }}
      />

      {/* Первый экран */}
      <section
        aria-labelledby="landing-title"
        className="relative -mx-4 overflow-hidden bg-slate-950 px-4 py-12 text-white sm:mx-0 sm:rounded-[2rem] sm:px-10 sm:py-16"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-amber-500/20 blur-3xl"
        />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div className="flex flex-col gap-5">
            <p className="eyebrow text-amber-400">
              Сайты под ключ · {SITE.platform} от {SITE.name}
            </p>
            <h1
              id="landing-title"
              className="text-3xl font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-5xl"
            >
              Сайт для вашего бизнеса — сначала покажем готовый
            </h1>
            <p className="max-w-xl text-base text-white/80 sm:text-lg">
              Соберём сайт по данным вашей карточки на карте: услуги, адрес, часы работы, телефон.
              Сначала покажем готовый сайт — решаете потом.
            </p>
            {first && (
              <p className="text-sm text-white/70">
                {first.title} — {packagePriceLine(first)}. Счёт — только после того, как вы
                посмотрели сайт и согласились.
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={FORM_HREF}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-amber-500 px-7 text-base font-bold text-slate-950 transition hover:bg-amber-400"
              >
                Хочу сайт
              </a>
              <a
                href={EXAMPLES_HREF}
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/30 px-7 text-base font-semibold text-white transition hover:bg-white/10"
              >
                Посмотреть примеры
              </a>
            </div>
          </div>
          {mockup && (
            <div className="mx-auto w-full max-w-md lg:max-w-none">
              <SiteMockup example={mockup} city={DEMO_CITY} />
            </div>
          )}
        </div>
      </section>

      {/* Как это работает */}
      <section aria-labelledby="kak" className="flex flex-col gap-8">
        <SectionTitle id="kak" eyebrow="Как это работает" title="Сначала сайт, потом решение" />
        <ol className="grid gap-4 md:grid-cols-3">
          {LANDING_STEPS.map((step, index) => (
            <li
              key={step.title}
              className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-6"
            >
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 font-mono text-base font-bold text-slate-950"
              >
                {index + 1}
              </span>
              <h3 className="text-lg font-bold text-slate-900">{step.title}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Что входит */}
      <section aria-labelledby="vhodit" className="grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionTitle id="vhodit" eyebrow="Что входит" title="Всё, чтобы клиент позвонил" />
          <p className="mt-4 text-base text-slate-600">
            Один экран о главном — без лишних страниц, которые надо наполнять. Клиент видит, чем вы
            занимаетесь, где вы и как с вами связаться.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
          {LANDING_INCLUDES.map((line) => (
            <li
              key={line}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-800"
            >
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </section>

      {/* Пакеты и цены */}
      <section aria-labelledby="ceny" className="flex flex-col gap-8">
        <SectionTitle id="ceny" eyebrow="Пакеты и цены" title="Два пакета, цены открыто" />
        <PackageCards packages={packages} formHref={FORM_HREF} />
        <p className="text-sm text-slate-600">
          Оплата по счёту банковским переводом, онлайн-оплаты нет. Сначала вы смотрите готовый сайт
          и соглашаетесь — потом получаете счёт.
        </p>
      </section>

      {/* Примеры */}
      <section
        id={LANDING_EXAMPLES_ANCHOR}
        aria-labelledby="primery-title"
        className="flex scroll-mt-28 flex-col gap-8"
      >
        <SectionTitle id="primery-title" eyebrow="Примеры" title="Как выглядит сайт" />
        <p className="-mt-4 max-w-2xl text-base text-slate-600">
          Шаблоны на вымышленных компаниях. Ваш сайт будет с вашим названием, услугами, адресом и
          телефоном.
        </p>
        <ExampleCards examples={examples} />
      </section>

      {/* Вопросы и ответы */}
      <Faq items={landingFaq(base)} title="Вопросы и ответы" />

      {/* Заявка */}
      <section
        id={LANDING_FORM_ANCHOR}
        aria-labelledby="zayavka-title"
        className="grid scroll-mt-28 gap-8 rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-10 lg:grid-cols-12"
      >
        <div className="flex flex-col gap-3 lg:col-span-5">
          <p className="eyebrow text-amber-700">Заявка</p>
          <h2
            id="zayavka-title"
            className="text-2xl font-extrabold tracking-[-0.02em] text-slate-900 sm:text-4xl"
          >
            Хочу сайт
          </h2>
          <p className="text-base text-slate-600">
            Оставьте телефон — мы позвоним, уточним, чем вы занимаетесь, и покажем, как будет
            выглядеть ваш сайт. Это бесплатно и ни к чему не обязывает.
          </p>
          <p className="text-sm text-slate-600">
            Или позвоните сами:{' '}
            <a href={SITE.phoneHref} className="font-semibold text-amber-700 hover:underline">
              {SITE.phone}
            </a>
          </p>
        </div>
        <div className="lg:col-span-7">
          <SiteRequestForm />
        </div>
      </section>
    </article>
  );
}
