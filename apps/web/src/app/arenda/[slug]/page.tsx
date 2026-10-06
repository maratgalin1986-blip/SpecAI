import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@specai/database';
import { Card, StatusBadge } from '@specai/ui';
import { CallbackForm } from '@/components/CallbackForm';
import { Faq } from '@/components/Faq';
import { TrustBadges } from '@/components/TrustBadges';
import { LANDINGS, landingBySlug } from '@/lib/landings';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';
import { CinemaBand } from '@/components/CinemaBand';
import { CinemaLayer } from '@/components/CinemaHero';
import { fromPrice, houseRate, rateOf, rub } from '@/lib/prices';
import { HOUSE_FIRST_ORDER, PUBLIC_FLEET, isHouseEquipment } from '@/lib/fleet';
import { customerRates } from '@/lib/equipmentCatalog';
import { MachineAmbience } from '@/components/MachineAmbience';
import { TelegramButton } from '@/components/TelegramButton';
import { cityPath, NEARBY_CITIES } from '@/lib/cities';
import { landingClips } from '@/lib/landingClips';

export const revalidate = 300;

export function generateStaticParams() {
  return LANDINGS.map((landing) => ({ slug: landing.slug }));
}

async function loadEquipment(categorySlug: string) {
  try {
    return await prisma.equipment.findMany({
      where: { ...PUBLIC_FLEET, category: { slug: categorySlug }, status: { not: 'RETIRED' } },
      include: { location: true },
      // СпецПласт16's machines first, then other providers'.
      orderBy: [HOUSE_FIRST_ORDER, { hourlyRate: 'asc' }],
    });
  } catch (error) {
    console.error('Failed to load equipment for landing', error);
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const landing = landingBySlug(params.slug);
  if (!landing) return { title: 'Страница не найдена' };
  // The price comes from lib/prices.ts, never from the database.
  const title = `Аренда ${landing.title} в Набережных Челнах — ${fromPrice(landing.machine)}`;
  return {
    title,
    description: `${landing.intro} ${SITE.city} и ${SITE.region}. ${SITE.phone}`,
    alternates: { canonical: `/arenda/${landing.slug}` },
    openGraph: { title, description: landing.intro },
  };
}

export default async function LandingPage({ params }: { params: { slug: string } }) {
  const landing = landingBySlug(params.slug);
  if (!landing) notFound();
  const items = await loadEquipment(landing.categorySlug);
  const machine = landing.machine;
  // «от …» in the title, header and structured data: lib/prices.ts only.
  const from = rateOf(machine);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: `Аренда ${landing.title}`,
    areaServed: [SITE.city, SITE.region],
    provider: { '@type': 'Organization', name: SITE.legalName || SITE.name, telephone: SITE.phone },
    url: `${siteUrl()}/arenda/${landing.slug}`,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'RUB',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: from,
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
          <div className="flex flex-col justify-center">
            <nav className="text-sm text-slate-400">
              <a href="/" className="hover:text-white">
                Главная
              </a>{' '}
              / <span>{landing.short}</span>
            </nav>
            <h1 className="cine-title mt-3 text-3xl font-extrabold leading-tight sm:text-5xl">
              Аренда {landing.title} в Набережных Челнах
            </h1>
            <p className="mt-4 text-slate-300">{landing.intro}</p>
            <p className="mt-5 text-3xl font-bold text-amber-400" data-testid="landing-price">
              от {rub(from)} ₽
              <span className="text-base font-normal text-slate-300">/ч с машинистом</span>
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={SITE.phoneHref}
                className="rounded-md bg-amber-500 px-5 py-3 font-semibold hover:bg-amber-400 text-slate-950"
              >
                {SITE.phone}
              </a>
              <a
                href={SITE.whatsappHref}
                target="_blank"
                rel="noopener"
                className="rounded-md bg-emerald-700 px-5 py-3 font-semibold hover:bg-emerald-600"
              >
                Написать в WhatsApp
              </a>
              <TelegramButton page={`/arenda/${landing.slug}`} dark />
            </div>
            <p className="mt-3 flex flex-wrap gap-x-2 text-sm text-slate-300">
              <span>Работаем также:</span>
              {NEARBY_CITIES.map((city, i) => (
                <span key={city.slug}>
                  {i > 0 && <span className="mr-2 text-slate-500">·</span>}
                  <a
                    href={cityPath(landing.slug, city.slug)}
                    className="text-amber-300 hover:underline"
                  >
                    {city.name}
                  </a>
                </span>
              ))}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              <a href="/privacy" className="underline hover:text-white">
                Политика конфиденциальности
              </a>
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 backdrop-blur">
            <CallbackForm
              source={`landing:${landing.slug}`}
              defaultMessage={`Нужна аренда ${landing.title}`}
              subtitle={`${SITE.callbackPromise}.`}
              dark
            />
          </div>
        </div>
      </section>

      <TrustBadges />

      {items.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold">Техника в наличии</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <a key={item.id} href={`/equipment/${item.id}`}>
                <Card className="flex h-full flex-col gap-2 hover:border-amber-400">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{item.name}</h3>
                    <StatusBadge status={item.status} />
                  </div>
                  {item.location && <p className="text-sm text-slate-500">{item.location.city}</p>}
                  {/* The house fleet never below the site price list (lib/prices.ts);
                      other providers show their own rate. */}
                  <p className="mt-auto text-lg font-semibold" data-testid="fleet-card-price">
                    от{' '}
                    {rub(
                      isHouseEquipment(item)
                        ? houseRate(item.hourlyRate, machine)
                        : customerRates({ ...item, categoryName: landing.title }).hourlyRate,
                    )}{' '}
                    ₽<span className="text-sm font-normal text-slate-500">/ч</span>
                  </p>
                  <span className="text-sm font-medium text-amber-700">Рассчитать стоимость →</span>
                </Card>
              </a>
            ))}
          </div>
        </section>
      )}

      <CinemaBand
        machine={machine}
        eyebrow={`Аренда ${landing.title}`}
        phrase="Скажите задачу — приедет машина и машинист"
      />

      <section>
        <h2 className="text-2xl font-bold">Какие задачи решаем</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {landing.tasks.map((task) => (
            <li key={task} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              ✔ {task}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-xl font-bold">Что входит в стоимость</h2>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          <li>✔ Работа машиниста</li>
          <li>✔ Оплата по фактически отработанным часам, смена — 8 часов</li>
          <li>✔ Договор, счёт с НДС и закрывающие документы</li>
          <li>• Подача техники на объект — рассчитывается по адресу</li>
        </ul>
      </section>

      <CinemaBand
        machine={machine}
        eyebrow="Подача сегодня"
        phrase="Позвоните — назовём цену за пять минут"
        className="sm:min-h-[340px]"
      />

      <Faq items={landing.faq} />

      <section className="flex flex-wrap gap-2 text-sm">
        <span className="text-slate-500">Другая техника:</span>
        {LANDINGS.filter((l) => l.slug !== landing.slug).map((l) => (
          <a key={l.slug} href={`/arenda/${l.slug}`} className="text-amber-700 hover:underline">
            {l.short}
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
