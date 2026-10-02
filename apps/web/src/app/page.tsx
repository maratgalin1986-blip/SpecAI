import dynamic from 'next/dynamic';
import { prisma } from '@specai/database';
import { Button } from '@specai/ui';
import { PUBLIC_AGENT_PROFILES } from '@specai/shared';
import { CallbackForm } from '@/components/CallbackForm';
import { CallbackIris } from '@/components/CallbackIris';
import { CinemaBand } from '@/components/CinemaBand';
import { CountUp } from '@/components/CountUp';
import { Faq } from '@/components/Faq';
import { HeroPhotos } from '@/components/HeroPhotos';
import { Icon, type IconName } from '@/components/Icon';
import { IntroSplash } from '@/components/IntroSplash';
import { MachinePhoto } from '@/components/MachinePhoto';
import { Reveal } from '@/components/Reveal';
import { TiltCard } from '@/components/TiltCard';
import type { MachineType } from '@/lib/machinePhotos';
import { pluralizeRu } from '@/lib/pluralize';
import { SITE } from '@/lib/site';

// Big interactive blocks below the fold: separate chunks, so the browser
// hydrates them in their own short tasks instead of one long one.
const SiteJourney = dynamic(() => import('@/components/SiteJourney').then((m) => m.SiteJourney));
const ShiftStory = dynamic(() => import('@/components/ShiftStory').then((m) => m.ShiftStory));
const TaskWizard = dynamic(() => import('@/components/TaskWizard').then((m) => m.TaskWizard));

const SERVICES: {
  icon: IconName;
  title: string;
  text: string;
  price?: string;
  photo: MachineType;
}[] = [
  {
    icon: 'excavator',
    title: 'Экскаваторы-погрузчики',
    photo: 'backhoe',
    text: 'JCB 4CX, CASE 570, Hidromek 102B, LGCE B877F — траншеи, котлованы, планировка.',
    price: 'от 3 000 ₽/ч',
  },
  {
    icon: 'excavator',
    title: 'Гусеничные экскаваторы',
    photo: 'excavator',
    text: 'Котлованы, карьеры и большие объёмы грунта — ковш под задачу.',
    price: 'от 3 000 ₽/ч',
  },
  {
    icon: 'hammer',
    title: 'Гидромолот',
    photo: 'trench',
    text: 'Демонтаж, вскрытие асфальта и бетона, работа по мёрзлому грунту.',
    price: 'от 3 500 ₽/ч',
  },
  {
    icon: 'hammer',
    title: 'Колёсный экскаватор с гидромолотом',
    photo: 'wheeled-excavator',
    text: 'Дробление бетона и асфальта в городе — своим ходом, без трала.',
    price: 'от 3 000 ₽/ч',
  },
  {
    icon: 'crane',
    title: 'Автокраны',
    photo: 'crane',
    text: 'До 32 т — монтаж конструкций, погрузка и подъём грузов.',
    price: 'от 3 500 ₽/ч',
  },
  {
    icon: 'crane',
    title: 'Манипулятор КМУ 7 т',
    photo: 'kmu',
    text: 'Погрузка, перевозка и разгрузка одной машиной: блоки, плиты, бытовки.',
    price: 'от 3 000 ₽/ч',
  },
  {
    icon: 'lift',
    title: 'Автовышка АГП',
    photo: 'agp',
    text: 'Работы на высоте: фасады, кровля, освещение, вывески, обрезка деревьев.',
    price: 'от 2 500 ₽/ч',
  },
  {
    icon: 'loader',
    title: 'Фронтальные погрузчики',
    photo: 'loader',
    text: 'Погрузка грунта, щебня и песка, уборка снега на объектах.',
    price: 'от 3 000 ₽/ч',
  },
  {
    icon: 'roller',
    title: 'Виброкаток',
    photo: 'roller',
    text: 'Уплотнение грунта, щебня и асфальта на дорогах и благоустройстве.',
    price: 'от 3 000 ₽/ч',
  },
  {
    icon: 'tractor',
    title: 'Тракторы',
    photo: 'tractor',
    text: 'МТЗ «Беларус» для вспомогательных и коммунальных работ.',
    price: 'от 2 500 ₽/ч',
  },
  {
    icon: 'helmet',
    title: 'Техника с оператором',
    photo: 'dozer',
    text: 'Опытные машинисты, работа по договору, документы и ЭДО для юрлиц.',
  },
];

const MARQUEE = [
  'Экскаваторы-погрузчики',
  'Автокраны до 32 т',
  'Гидромолот',
  'Фронтальные погрузчики',
  'Тракторы МТЗ',
  'Самосвалы',
  'Работа с НДС',
  'Смена 8 часов',
];

const ADVANTAGES = [
  {
    title: 'С машинистом',
    text: 'Опытный оператор на каждой машине — вам не нужно искать своего.',
  },
  { title: 'Цена видна сразу', text: 'Почасовая ставка без скрытых доплат, смена — 8 часов.' },
  {
    title: 'Несколько предложений',
    text: 'Исполнители отвечают на заявку ценой — вы выбираете, сервис бесплатный.',
  },
  { title: 'Круглосуточно', text: 'ИИ-агенты подберут технику и примут заявку даже ночью.' },
];

const STEPS = [
  { title: 'Опишите задачу', text: 'Своими словами — в чате ИИ-агенту или в форме заявки.' },
  {
    title: 'Получите варианты',
    text: 'Исполнители пришлют цены, агент подберёт технику из каталога и посчитает стоимость.',
  },
  {
    title: 'Забронируйте',
    text: 'Примите предложение — исполнитель подтвердит бронь и закрепит машину и машиниста.',
  },
  { title: 'Работайте', text: 'Следите за статусом в личном кабинете, оставьте отзыв.' },
];

// Service cards link to their catalog category (matched by name) and show how
// much equipment is listed there. Falls back to plain cards without a database.
export const revalidate = 300;

async function loadCategoryLinks() {
  try {
    const categories = await prisma.equipmentCategory.findMany({
      include: { _count: { select: { equipment: { where: { status: 'AVAILABLE' } } } } },
    });
    const links = new Map(
      categories.map((category) => [
        category.name,
        { id: category.id, available: category._count.equipment },
      ]),
    );
    const available = categories.reduce((sum, category) => sum + category._count.equipment, 0);
    return { links, available };
  } catch (error) {
    console.error('Failed to load categories for the home page', error);
    return { links: new Map<string, { id: string; available: number }>(), available: 0 };
  }
}

const SERVICE_CATEGORY: Record<string, string> = {
  'Экскаваторы-погрузчики': 'Экскаваторы-погрузчики',
  Гидромолот: 'Экскаваторы-погрузчики',
  'Гусеничные экскаваторы': 'Экскаваторы',
  'Колёсный экскаватор с гидромолотом': 'Экскаваторы',
  Автокраны: 'Краны',
  'Манипулятор КМУ 7 т': 'Манипуляторы',
  'Автовышка АГП': 'Автовышки',
  'Фронтальные погрузчики': 'Погрузчики',
  Тракторы: 'Тракторы',
};

const SERVICE_LANDING: Record<string, string> = {
  'Экскаваторы-погрузчики': 'ekskavator-pogruzchik',
  Гидромолот: 'ekskavator-pogruzchik',
  Автокраны: 'avtokran',
  'Фронтальные погрузчики': 'frontalnyj-pogruzchik',
  Тракторы: 'traktor',
  'Гусеничные экскаваторы': 'gusenichnyj-ekskavator',
  'Колёсный экскаватор с гидромолотом': 'kolyosnyj-ekskavator-gidromolot',
  'Манипулятор КМУ 7 т': 'manipulyator-kmu',
  'Автовышка АГП': 'avtovyshka-agp',
  Виброкаток: 'vibrokatok',
};

const HOME_FAQ = [
  {
    q: 'Сколько стоит аренда спецтехники?',
    a: 'Экскаватор-погрузчик, фронтальный погрузчик, гусеничный и колёсный экскаватор, манипулятор КМУ, бульдозер и каток — от 3 000 ₽/ч, с гидромолотом — от 3 500 ₽/ч, автокраны — от 3 500 ₽/ч, трактор и автовышка — от 2 500 ₽/ч, самосвал — от 2 300 ₽/ч. Все цены — с машинистом, смена 8 часов.',
  },
  {
    q: 'Как быстро приедет техника?',
    a: 'Зависит от загрузки парка и адреса. Оставьте заявку или позвоните — менеджер назовёт время подачи.',
  },
  {
    q: 'Работаете с юридическими лицами?',
    a: 'Да: договор, оплата по безналу с НДС, закрывающие документы, в том числе через ЭДО.',
  },
  {
    q: 'Где вы работаете?',
    a: 'В Набережных Челнах и по Татарстану. Стоимость подачи зависит от расстояния до объекта.',
  },
  {
    q: 'Можно заказать технику через ИИ-агента?',
    a: 'Да, агенты на сайте подберут технику, посчитают стоимость и оформят заявку круглосуточно.',
  },
];

export default async function HomePage() {
  const { links: categoryLinks, available } = await loadCategoryLinks();
  const stats = [
    ...(available > 0
      ? [{ prefix: '', value: available, suffix: '', label: 'единиц техники свободно' }]
      : []),
    { prefix: 'от ', value: 2300, suffix: ' ₽', label: 'час работы с машинистом' },
    { prefix: '', value: 8, suffix: ' ч', label: 'смена, оплата по факту' },
    { prefix: '', value: 15, suffix: ' мин', label: 'перезвоним в рабочее время' },
  ];

  return (
    <div className="flex flex-col gap-24">
      <IntroSplash />
      <section className="hero-short depth-exit relative -mt-2 min-h-[640px] overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-2xl lg:min-h-[680px]">
        <HeroPhotos />
        <div className="hero-parallax-text relative grid lg:grid-cols-2">
          <div className="hero-copy z-10 flex flex-col justify-center px-6 pb-20 pt-14 sm:px-10 lg:py-24">
            <div className="float-in inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="eyebrow text-slate-200">
                {SITE.city} · свой парк, подача сегодня
              </span>
            </div>
            <h1
              className="float-in mt-6 text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-6xl"
              style={{ animationDelay: '120ms' }}
            >
              Аренда <span className="marker text-white">спецтехники</span> с машинистом
            </h1>
            <p
              className="float-in mt-6 max-w-xl text-lg leading-relaxed text-slate-300"
              style={{ animationDelay: '240ms' }}
            >
              Экскаваторы-погрузчики, автокраны и погрузчики с машинистами в Набережных Челнах и по
              Татарстану — от 2 300 ₽/ч. Оставьте заявку: исполнители со своей техникой, включая
              парк {SITE.name}, пришлют цены, вы выберете лучшее. Сервис бесплатный.
            </p>
            <div className="float-in mt-8 flex flex-wrap gap-3" style={{ animationDelay: '360ms' }}>
              <a
                href={SITE.phoneHref}
                className="inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-amber-500 px-6 py-3.5 font-mono text-lg font-bold tabular-nums text-slate-950 shadow-lg shadow-amber-500/30 transition hover:bg-amber-400 sm:w-auto"
              >
                <Icon name="phone" className="h-5 w-5" />
                {SITE.phone}
              </a>
              <a
                href="#callback"
                className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-base font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                Заказать технику
                <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-1" />
              </a>
              <a
                href="#podbor"
                className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-base font-semibold text-white ring-1 ring-white/30 backdrop-blur transition hover:bg-white/10"
              >
                Подобрать технику
              </a>
            </div>
            <p className="float-in mt-5 text-sm text-slate-400" style={{ animationDelay: '480ms' }}>
              Свой парк · Свои машинисты · Без посредников · Работаем с НДС и ЭДО
            </p>
          </div>
        </div>
      </section>

      {/* Right under the hero, so no entrance effect: it must read at rest.
          The numbers themselves count up. */}
      <section className="-mt-12 grid grid-cols-2 overflow-hidden rounded-3xl border border-slate-200 bg-white lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="border-slate-200 p-5 sm:p-7 [&:not(:last-child)]:border-r max-lg:[&:nth-child(2)]:border-r-0 max-lg:[&:nth-child(-n+2)]:border-b"
          >
            <div className="whitespace-nowrap text-2xl font-extrabold tracking-tight sm:text-4xl">
              {stat.prefix}
              <CountUp value={stat.value} />
              {stat.suffix}
            </div>
            <div className="mt-1 text-sm text-slate-500">{stat.label}</div>
          </div>
        ))}
      </section>

      <div className="depth -my-10 overflow-hidden border-y border-slate-200 py-4" aria-hidden>
        <div className="marquee">
          {[...MARQUEE, ...MARQUEE].map((item, index) => (
            <span key={index} className="eyebrow flex items-center gap-8 pr-8 text-slate-500">
              {item}
              <span className="text-amber-500">✦</span>
            </span>
          ))}
        </div>
      </div>

      <SiteJourney />

      <div className="depth">
        <TaskWizard />
      </div>

      <section className="depth">
        <Reveal>
          <div className="eyebrow text-amber-700">Техника и цены</div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h2 className="max-w-2xl text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              Цена видна сразу, без скрытых доплат
            </h2>
            <a
              href="/equipment"
              className="group inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold transition hover:border-slate-900"
            >
              Весь каталог
              <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>
            <a
              href="/map"
              className="group inline-flex items-center gap-2 rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold transition hover:border-slate-900"
            >
              Исполнители на карте
              <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>
          </div>
          <p className="mt-3 text-slate-600">Все цены — с машинистом, смена 8 часов.</p>
        </Reveal>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service, index) => {
            const category = categoryLinks.get(SERVICE_CATEGORY[service.title] ?? '');
            return (
              <Reveal key={service.title} delay={(index % 3) * 60} className="h-full">
                <TiltCard max={8} className="rounded-3xl border border-slate-200 bg-white">
                  <a
                    href={
                      SERVICE_LANDING[service.title]
                        ? `/arenda/${SERVICE_LANDING[service.title]}`
                        : category
                          ? `/equipment?category=${category.id}`
                          : '#callback'
                    }
                    className="group flex h-full flex-col"
                  >
                    <div className="cine-frame relative aspect-[16/9] overflow-hidden">
                      <MachinePhoto
                        type={service.photo}
                        slot="services"
                        alt={service.title}
                        sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
                        className="tilt-zoom absolute inset-0"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 to-transparent" />
                      <span className="absolute bottom-4 left-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950/80 text-amber-400 ring-1 ring-white/10 backdrop-blur transition group-hover:bg-amber-500 group-hover:text-slate-950">
                        <Icon name={service.icon} className="h-6 w-6" />
                      </span>
                      {category && category.available > 0 && (
                        <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-emerald-700 backdrop-blur">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {pluralizeRu(category.available, ['единица', 'единицы', 'единиц'])}{' '}
                          свободно
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-6">
                      <h3 className="text-xl font-bold tracking-tight">{service.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">{service.text}</p>
                      <div className="mt-auto flex items-center justify-between pt-6">
                        <span className="font-mono text-sm font-semibold text-slate-900">
                          {service.price ?? 'по договору'}
                        </span>
                        <Icon
                          name="arrow"
                          className="h-5 w-5 text-amber-700 transition group-hover:translate-x-1"
                        />
                      </div>
                    </div>
                  </a>
                </TiltCard>
              </Reveal>
            );
          })}
          <Reveal delay={120} className="h-full">
            <TiltCard max={8} dark className="rounded-3xl border border-slate-800 bg-slate-950">
              <a href="#podbor" className="group flex h-full min-h-[18rem] flex-col p-6 sm:p-8">
                <div className="hero-grid opacity-30" aria-hidden />
                <div className="eyebrow relative text-amber-400">Не нашли свою?</div>
                <h3 className="relative mt-3 text-2xl font-extrabold tracking-tight text-white">
                  Подберём технику под задачу
                </h3>
                <p className="relative mt-2 text-sm leading-relaxed text-slate-400">
                  Три вопроса — и вы увидите подходящую машину и ориентир по цене.
                </p>
                <span className="relative mt-auto inline-flex w-fit items-center gap-2 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition group-hover:bg-amber-400">
                  Подобрать технику
                  <Icon name="arrow" className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </a>
            </TiltCard>
          </Reveal>
        </div>
      </section>

      <CinemaBand
        machine="excavator"
        eyebrow="Свой парк"
        phrase="Котлован к утру — не обещание, а наряд"
      />

      <ShiftStory />

      <section className="grid gap-10 lg:grid-cols-12">
        <div className="lg:sticky lg:top-28 lg:col-span-5 lg:self-start">
          <Reveal>
            <div className="eyebrow text-amber-700">Почему мы</div>
            <h2 className="mt-3 text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              Исполнители с техникой и машинистами
            </h2>
            <p className="mt-4 text-slate-600">
              {SITE.name} — сервис заказа спецтехники в{' '}
              {SITE.city === 'Набережные Челны' ? 'Набережных Челнах' : SITE.city}: собственный парк
              и проверенные исполнители. Подберём машину под задачу и покажем цены с подачей.
            </p>
          </Reveal>
        </div>
        <div className="flex flex-col gap-4 lg:col-span-7">
          {ADVANTAGES.map((item, index) => (
            <Reveal key={item.title} delay={index * 80}>
              <div className="group flex items-start gap-5 border-b border-slate-200 pb-6">
                <span className="font-mono text-sm text-amber-700">0{index + 1}</span>
                <div>
                  <h3 className="text-2xl font-bold tracking-tight transition group-hover:text-amber-600 sm:text-3xl">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-slate-600">{item.text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="depth relative overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-14 text-white sm:px-10">
        <div className="hero-grid opacity-40" aria-hidden />
        <div className="relative flex flex-col items-start gap-8 lg:flex-row lg:items-center">
          <Reveal className="flex-1">
            <div className="eyebrow text-amber-400">Искусственный интеллект</div>
            <h2 className="mt-3 text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              Команда ИИ-агентов
            </h2>
            <p className="mt-4 max-w-xl text-slate-300">
              Каждый агент работает с живыми данными сайта: каталогом, заявками и вашими
              бронированиями. Не знаете, к кому обратиться? Режим «Авто» сам передаст вопрос нужному
              специалисту.
            </p>
          </Reveal>
          <div className="cube-scene mx-auto shrink-0 lg:mx-12" aria-hidden>
            <div className="cube">
              {[...PUBLIC_AGENT_PROFILES.map((a) => a.name), 'ИИ', SITE.name].map((label) => (
                <div key={label} className="cube-face">
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="relative mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PUBLIC_AGENT_PROFILES.map((agent, index) => (
            <Reveal key={agent.id} delay={index * 100}>
              <TiltCard dark>
                <div className="eyebrow text-[0.65rem] text-amber-400">{agent.role}</div>
                <h3 className="mt-2 text-lg font-bold">{agent.name}</h3>
                <p className="mt-2 text-sm text-slate-300">{agent.description}</p>
                <a
                  href={`/agents?agent=${agent.id}`}
                  className="mt-4 inline-block text-sm font-semibold text-amber-400 hover:underline"
                >
                  Написать →
                </a>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="grid gap-10 lg:grid-cols-12">
        <div className="lg:sticky lg:top-28 lg:col-span-5 lg:self-start">
          <Reveal>
            <div className="eyebrow text-amber-700">Как это работает</div>
            <h2 className="mt-3 text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">
              Четыре шага до техники на объекте
            </h2>
          </Reveal>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Reveal delay={index * 100} className="h-full">
                <div className="h-full rounded-3xl border border-slate-200 bg-white p-6 transition hover:-translate-y-1 hover:border-amber-300">
                  <div className="font-mono text-4xl font-bold text-amber-500">0{index + 1}</div>
                  <h3 className="mt-4 text-lg font-bold">{step.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{step.text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <CinemaBand
        machine="crane"
        eyebrow="Подача сегодня"
        phrase="Техника уже едет. Осталось сказать куда"
      />

      <div className="depth">
        <Faq items={HOME_FAQ} />
      </div>

      <section id="callback" className="scroll-mt-24">
        <CallbackIris backdrop="/images/trench.jpg">
          <div className="grid grid-cols-1 gap-8 p-6 sm:p-10 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col justify-center">
              <div className="eyebrow text-amber-400">Быстрый заказ</div>
              <h2 className="mt-3 text-4xl font-extrabold uppercase leading-[0.95] tracking-[-0.03em] sm:text-6xl">
                Нужна техника сегодня?
              </h2>
              <ul className="mt-6 space-y-2 text-slate-200">
                <li>✔ Подберём технику под задачу и бюджет</li>
                <li>✔ Назовём точную цену с доставкой</li>
                <li>✔ Работаем в Набережных Челнах и по всему Татарстану</li>
              </ul>
              <a
                href={SITE.phoneHref}
                className="mt-6 inline-flex items-center gap-2 text-2xl font-bold text-amber-400"
              >
                <Icon name="phone" className="h-6 w-6" />
                {SITE.phone}
              </a>
            </div>
            <div className="min-w-0 rounded-3xl bg-slate-950/50 p-4 ring-1 ring-white/10 backdrop-blur sm:p-6">
              <CallbackForm source="home" dark />
            </div>
          </div>
        </CallbackIris>
      </section>

      <Reveal>
        <section className="grid gap-6 rounded-[2rem] border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100 p-6 sm:grid-cols-2 sm:p-10">
          <div>
            <div className="eyebrow text-amber-700">Как «такси» для спецтехники</div>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight">
              Одна заявка — несколько предложений
            </h2>
            <p className="mt-3 text-slate-700">
              Опишите задачу — её увидят исполнители со своей техникой и машинистами, включая парк{' '}
              {SITE.name}. Сравните цены, выберите предложение и договоритесь напрямую. Сервис
              бесплатный, без комиссий.
            </p>
            <a href="/orders" className="mt-5 inline-block">
              <Button>Оставить заявку</Button>
            </a>
          </div>
          <div className="flex flex-col gap-2 text-slate-700">
            <h3 className="font-semibold">Контакты</h3>
            <a href={SITE.phoneHref} className="text-2xl font-bold text-slate-900">
              {SITE.phone}
            </a>
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
            <span>
              {SITE.city}, {SITE.region}
            </span>
            <span className="text-sm">{SITE.workingHours}</span>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
