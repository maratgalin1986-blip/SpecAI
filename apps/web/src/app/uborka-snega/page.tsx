import type { Metadata } from 'next';
import { Faq } from '@/components/Faq';
import { Icon } from '@/components/Icon';
import { MachinePhoto } from '@/components/MachinePhoto';
import { WhatsAppIcon } from '@/components/MessengerButtons';
import { ShowOrbs } from '@/components/ShowOrbs';
import { SnegForm } from '@/components/SnegForm';
import { TelegramButton } from '@/components/TelegramButton';
import { DELIVERY_NOTE } from '@/lib/cities';
import { pageMeta, pickTitle } from '@/lib/pageMeta';
import { fromPerHour, fromPrice, rateOf } from '@/lib/prices';
import { SHIFT, SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';
import {
  HOUSE_DELIVERY_PROMISE,
  SNEG_AUDIENCE,
  SNEG_CITY,
  SNEG_MACHINES,
  SNEG_PACKAGE_TITLE,
  SNEG_PATH,
  SNEG_STEPS,
  snegFaq,
  snegPackage,
  snegPackageLine,
} from '@/lib/sneg';

// The seasonal page (roadmap № 4): СпецПласт16's own fleet clears and hauls snow
// in Набережные Челны; a visitor from another city is sent to the platform's
// order form, where the providers of that city answer. Static: no database.

const TITLE = pickTitle(
  `Уборка и вывоз снега в ${SNEG_CITY.in} — погрузчик и самосвал с машинистом`,
  `Уборка и вывоз снега в ${SNEG_CITY.in} — погрузчик и самосвал`,
);
const DESCRIPTION = `Механизированная уборка и вывоз снега техникой ${SITE.name}: ${snegPackageLine()}. ${HOUSE_DELIVERY_PROMISE}, работаем с НДС. В других городах — заявка на площадке ${SITE.platform}.`;

// The search snippet keeps whole sentences within 160 characters; link
// previews show the full text.
export const metadata: Metadata = pageMeta(SNEG_PATH, {
  title: TITLE,
  description: DESCRIPTION,
  ogDescription: DESCRIPTION,
});

const WHATSAPP = `${SITE.whatsappHref}?text=${encodeURIComponent(
  'Здравствуйте! Нужна уборка снега. Адрес: ',
)}`;

export default function SnegPage() {
  const pack = snegPackage();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Уборка и вывоз снега',
    serviceType: 'Механизированная уборка и вывоз снега спецтехникой с машинистом',
    description: DESCRIPTION,
    // СпецПласт16's own fleet: the city it promises to reach, nothing wider.
    areaServed: { '@type': 'City', name: SITE.city },
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
    url: `${siteUrl()}${SNEG_PATH}`,
    offers: SNEG_MACHINES.map((machine) => ({
      '@type': 'Offer',
      name: machine.name,
      priceCurrency: 'RUB',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: rateOf(machine.type),
        priceCurrency: 'RUB',
        unitText: 'час',
      },
    })),
  };

  return (
    <div className="flex flex-col gap-12">
      <section className="show-stage relative overflow-hidden rounded-[2rem] bg-slate-950 px-5 py-9 text-white shadow-2xl sm:px-10 sm:py-14">
        <ShowOrbs dark />
        <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
          <div className="show-seq flex min-w-0 flex-col justify-center">
            <nav className="text-sm text-slate-400">
              <a href="/" className="hover:text-white">
                Главная
              </a>{' '}
              / <span>Уборка снега</span>
            </nav>
            <p className="eyebrow mt-4 text-sky-300">Сезон: ноябрь — март</p>
            <h1 className="mt-2 break-words text-3xl font-extrabold leading-tight sm:text-5xl">
              Уборка и вывоз снега в {SNEG_CITY.in}
            </h1>
            <p className="mt-4 max-w-xl text-slate-300">
              Механизированная уборка: погрузчик сгребает и грузит, самосвал вывозит, трактор
              расчищает дворы и проезды. Свой парк {SITE.name} с машинистами.{' '}
              {HOUSE_DELIVERY_PROMISE}, работаем с НДС.
            </p>
            <p className="mt-5 text-lg font-bold text-amber-400" data-testid="sneg-package">
              {SNEG_PACKAGE_TITLE}
              <span className="mt-1 block text-base font-normal text-slate-200">
                {snegPackageLine()}
              </span>
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={SITE.phoneHref}
                data-testid="sneg-call"
                className="show-cta inline-flex min-h-12 items-center gap-2 rounded-full bg-amber-500 px-5 font-semibold text-slate-950 hover:bg-amber-400"
              >
                <Icon name="phone" className="h-4 w-4" /> {SITE.phone}
              </a>
              <a
                href={WHATSAPP}
                target="_blank"
                rel="noopener"
                className="show-cta inline-flex min-h-12 items-center gap-2 rounded-full bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-600"
              >
                <WhatsAppIcon className="h-4 w-4" /> WhatsApp
              </a>
              <TelegramButton page={SNEG_PATH} className="min-h-12" dark />
            </div>
            <p className="mt-4 text-sm text-slate-400">
              Диспетчер на связи Пн–Сб {SHIFT.from}:00–{SHIFT.to}:00. Помощник на сайте примет
              заявку в любое время — диспетчер перезвонит в рабочие часы.
            </p>
          </div>
          <div
            id="callback"
            className="min-w-0 scroll-mt-28 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur sm:p-5"
          >
            <SnegForm />
            <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm leading-snug text-slate-200 ring-1 ring-white/10">
              Вам ответит <span className="font-bold text-white">Иван</span>, начальник отдела
              логистики {SITE.name}. Перезвонит за 15 минут в рабочее время.
            </p>
            <p className="mt-3 text-xs text-slate-400">
              {SITE.legalName} · ИНН {SITE.inn} · {SITE.city} · работаем с НДС
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Пакет «{SNEG_PACKAGE_TITLE}»</h2>
        <p className="mt-2 max-w-3xl text-slate-600">
          Две машины работают вместе: погрузчик грузит, самосвал возит. Погрузчик и один самосвал —{' '}
          <span className="whitespace-nowrap font-semibold text-slate-900" data-testid="sneg-total">
            {fromPrice(pack.total)}
          </span>{' '}
          за обе машины с машинистами. Это сумма двух цен из прайса {SITE.name}, без наценки за
          пакет; самосвалов может быть несколько — число подберёт диспетчер.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SNEG_MACHINES.map((machine) => (
            <a
              key={machine.type}
              href={`/arenda/${machine.landing}`}
              className="show-card group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white hover:border-amber-400"
            >
              <div className="relative h-40 bg-slate-200">
                <MachinePhoto
                  type={machine.type}
                  slot="sneg"
                  alt={machine.name}
                  sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                />
                <span className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-semibold text-white">
                  {machine.inPackage ? 'В пакете' : 'Отдельно'}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <span className="text-amber-700">
                    <Icon name={machine.icon} className="h-5 w-5" live />
                  </span>
                  {machine.name}
                </h3>
                <p className="text-sm text-slate-600">{machine.role}</p>
                <p className="mt-auto pt-2 text-lg font-semibold" data-testid="sneg-price">
                  {fromPerHour(machine.type)}
                </p>
                <span className="text-sm font-medium text-amber-700">Подробнее о технике →</span>
              </div>
            </a>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Цены парка {SITE.name}. Оплата — по фактически отработанным часам каждой машины.{' '}
          {DELIVERY_NOTE}
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Кому подходит</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SNEG_AUDIENCE.map((item) => (
            <li
              key={item.title}
              className="show-card rounded-2xl border border-slate-200 bg-white p-4"
            >
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{item.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Как работаем</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {SNEG_STEPS.map((step, i) => (
            <li
              key={step.title}
              className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-slate-950">
                {i + 1}
              </span>
              <span>
                <span className="block font-semibold text-slate-900">{step.title}</span>
                <span className="text-slate-600">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl bg-slate-950 p-6 text-white sm:p-8" data-testid="sneg-house">
          <p className="eyebrow text-amber-400">{SITE.city}</p>
          <h2 className="mt-2 text-2xl font-bold">Свой парк {SITE.name}</h2>
          <ul className="mt-4 flex flex-col gap-3 text-sm text-slate-200">
            <li className="flex gap-3">
              <Icon name="clock" className="h-5 w-5 shrink-0 text-amber-400" />
              {HOUSE_DELIVERY_PROMISE} после подтверждения заявки.
            </li>
            <li className="flex gap-3">
              <Icon name="tractor" className="h-5 w-5 shrink-0 text-amber-400" />
              Парк на линии: погрузчик, самосвал и трактор с машинистами. Свободную машину назовёт
              диспетчер.
            </li>
            <li className="flex gap-3">
              <Icon name="receipt" className="h-5 w-5 shrink-0 text-amber-400" />
              Работаем с НДС: договор, оплата по безналу, закрывающие документы и ЭДО.
            </li>
          </ul>
          <a
            href="#callback"
            className="show-cta mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-amber-500 px-5 font-semibold text-slate-950 hover:bg-amber-400"
          >
            Оставить заявку <Icon name="arrow" className="h-4 w-4" />
          </a>
        </div>
        <div
          className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"
          data-testid="sneg-other"
        >
          <p className="eyebrow text-amber-700">Другой город</p>
          <h2 className="mt-2 text-2xl font-bold">Заявка на площадке {SITE.platform}</h2>
          <p className="mt-4 text-sm text-slate-600">
            Свой парк {SITE.name} работает в {SNEG_CITY.in}. В других городах разместите заявку на
            площадке — на неё ответят исполнители вашего города со своими ценами и сроками, вы
            выберете подходящее предложение. {SITE.promise}.
          </p>
          <a
            href="/orders"
            className="show-cta mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-slate-900 px-5 font-semibold text-white hover:bg-slate-800"
          >
            Разместить заявку <Icon name="arrow" className="h-4 w-4" />
          </a>
        </div>
      </section>

      <Faq items={snegFaq()} title="Вопросы об уборке снега" />

      <section className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <span className="inline-flex min-h-[44px] items-center text-slate-500">
          Смотрите также:
        </span>
        {[
          { href: '/raboty/vyvoz-snega', label: 'Вывоз снега: как проходит работа' },
          ...SNEG_MACHINES.map((machine) => ({
            href: `/arenda/${machine.landing}`,
            label: machine.name,
          })),
          { href: '/raboty', label: 'Работы и цены' },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="inline-flex min-h-[44px] items-center text-amber-700 hover:underline"
          >
            {link.label}
          </a>
        ))}
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
