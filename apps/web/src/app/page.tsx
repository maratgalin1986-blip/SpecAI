import { Button } from '@specai/ui';
import { AGENT_PROFILES } from '@specai/shared';
import { CallbackForm } from '@/components/CallbackForm';
import { Hero3D } from '@/components/Hero3D';
import { Reveal } from '@/components/Reveal';
import { TiltCard } from '@/components/TiltCard';
import { SITE } from '@/lib/site';

const SERVICES = [
  { icon: '⛏️', title: 'Экскаваторы', text: 'Котлованы, траншеи, планировка участка, демонтаж.' },
  { icon: '🏗️', title: 'Автокраны', text: 'Монтаж конструкций, погрузка и подъём грузов.' },
  { icon: '🚜', title: 'Погрузчики', text: 'Фронтальные и мини-погрузчики для стройки и склада.' },
  { icon: '🚛', title: 'Самосвалы', text: 'Вывоз грунта и мусора, доставка сыпучих материалов.' },
  { icon: '🛠️', title: 'Бульдозеры', text: 'Планировка, засыпка, расчистка территории.' },
  {
    icon: '👷',
    title: 'Строительные услуги',
    text: 'Техника с оператором под ключ — от заявки до сдачи.',
  },
];

const STEPS = [
  { title: 'Опишите задачу', text: 'Своими словами — в чате ИИ-агенту или в форме заявки.' },
  { title: 'Получите варианты', text: 'Агент подберёт технику из каталога и посчитает стоимость.' },
  { title: 'Забронируйте', text: 'Подтвердите бронь или выберите лучшее предложение поставщиков.' },
  { title: 'Работайте', text: 'Следите за статусом в личном кабинете, оставьте отзыв.' },
];

const HIGHLIGHTS = [
  { value: '24/7', label: 'на связи' },
  { value: `${AGENT_PROFILES.length}`, label: 'ИИ-агента' },
  { value: '16', label: 'регион' },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-20">
      <section className="hero-backdrop relative -mt-2 overflow-hidden rounded-3xl text-white shadow-2xl">
        <div className="hero-grid" aria-hidden />
        <div className="relative grid lg:grid-cols-2">
          <div className="z-10 flex flex-col justify-center px-6 pb-4 pt-12 sm:px-10 lg:py-20">
            <div className="float-in text-sm font-semibold uppercase tracking-widest text-amber-400">
              {SITE.city} · {SITE.region}
            </div>
            <h1
              className="float-in mt-4 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl"
              style={{ animationDelay: '120ms' }}
            >
              <span className="text-gradient">{SITE.name}</span>
              <br />
              спецтехника с ИИ-агентами
            </h1>
            <p
              className="float-in mt-5 max-w-xl text-lg text-slate-300"
              style={{ animationDelay: '240ms' }}
            >
              Экскаваторы, краны, погрузчики и самосвалы от проверенных владельцев. ИИ-агенты
              круглосуточно подберут технику, посчитают стоимость и оформят заявку.
            </p>
            <div className="float-in mt-8 flex flex-wrap gap-3" style={{ animationDelay: '360ms' }}>
              <a
                href="/agents"
                className="inline-flex items-center rounded-md bg-amber-600 px-6 py-3 text-base font-medium text-white shadow-lg shadow-amber-600/40 transition hover:-translate-y-0.5 hover:bg-amber-500"
              >
                Спросить ИИ-агента
              </a>
              <a
                href="/equipment"
                className="inline-flex items-center rounded-md bg-white/10 px-6 py-3 text-base font-medium text-white ring-1 ring-white/30 backdrop-blur hover:bg-white/20"
              >
                Каталог техники
              </a>
              <a
                href="#callback"
                className="inline-flex items-center rounded-md px-4 py-3 text-base font-medium text-amber-300 underline-offset-4 hover:underline"
              >
                Заказать звонок
              </a>
            </div>
            <div
              className="float-in mt-10 grid max-w-md grid-cols-3 gap-4"
              style={{ animationDelay: '480ms' }}
            >
              {HIGHLIGHTS.map((item) => (
                <div key={item.label}>
                  <div className="text-2xl font-bold text-amber-400">{item.value}</div>
                  <div className="text-xs text-slate-400">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative h-[470px] sm:h-[520px] lg:h-auto lg:min-h-[620px]">
            <Hero3D />
          </div>
        </div>
      </section>

      <section>
        <Reveal>
          <h2 className="text-3xl font-bold">Техника и услуги</h2>
          <p className="mt-2 text-slate-600">Всё для стройки и земляных работ — в одном месте.</p>
        </Reveal>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service, index) => (
            <Reveal key={service.title} delay={index * 80}>
              <TiltCard>
                <div className="text-3xl">{service.icon}</div>
                <h3 className="mt-3 text-lg font-semibold">{service.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{service.text}</p>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-12 text-white sm:px-10">
        <div className="hero-grid opacity-40" aria-hidden />
        <div className="relative flex flex-col items-start gap-8 lg:flex-row lg:items-center">
          <Reveal className="flex-1">
            <div className="text-sm font-semibold uppercase tracking-widest text-amber-400">
              Искусственный интеллект
            </div>
            <h2 className="mt-2 text-3xl font-bold">Команда ИИ-агентов</h2>
            <p className="mt-3 max-w-xl text-slate-300">
              Каждый агент работает с живыми данными сайта: каталогом, заявками и вашими
              бронированиями. Не знаете, к кому обратиться? Режим «Авто» сам передаст вопрос нужному
              специалисту.
            </p>
          </Reveal>
          <div className="cube-scene mx-auto shrink-0 lg:mx-12" aria-hidden>
            <div className="cube">
              {[...AGENT_PROFILES.map((a) => a.name), 'ИИ', SITE.name].map((label) => (
                <div key={label} className="cube-face">
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="relative mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {AGENT_PROFILES.map((agent, index) => (
            <Reveal key={agent.id} delay={index * 100}>
              <TiltCard dark>
                <div className="text-xs font-semibold uppercase text-amber-400">{agent.role}</div>
                <h3 className="mt-1 text-lg font-semibold">{agent.name}</h3>
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

      <section>
        <Reveal>
          <h2 className="text-3xl font-bold">Как это работает</h2>
        </Reveal>
        <ol className="relative mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Reveal delay={index * 120}>
                <TiltCard>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-lg font-bold text-white shadow-lg shadow-amber-500/40">
                    {index + 1}
                  </div>
                  <h3 className="mt-4 font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{step.text}</p>
                </TiltCard>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <Reveal>
        <section
          id="callback"
          className="relative grid scroll-mt-24 grid-cols-1 gap-8 overflow-hidden rounded-3xl bg-slate-900 p-6 text-white sm:p-10 lg:grid-cols-2"
        >
          <div className="hero-grid opacity-30" aria-hidden />
          <div className="relative flex min-w-0 flex-col justify-center">
            <div className="text-sm font-semibold uppercase tracking-widest text-amber-400">
              Быстрый заказ
            </div>
            <h2 className="mt-2 text-3xl font-bold">Нужна техника? Оставьте заявку — перезвоним</h2>
            <ul className="mt-4 space-y-2 text-slate-300">
              <li>✔ Подберём технику под задачу и бюджет</li>
              <li>✔ Назовём точную цену с доставкой</li>
              <li>✔ Работаем в Казани и по всему Татарстану</li>
            </ul>
            <a href={SITE.phoneHref} className="mt-6 text-2xl font-bold text-amber-400">
              {SITE.phone}
            </a>
          </div>
          <div className="relative min-w-0 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur sm:p-5">
            <CallbackForm source="home" dark />
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="grid gap-6 rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-100 p-6 sm:grid-cols-2 sm:p-10">
          <div>
            <h2 className="text-3xl font-bold">Владеете техникой?</h2>
            <p className="mt-3 text-slate-700">
              Разместите парк на {SITE.name}, получайте заявки клиентов и делайте ставки. ИИ
              заполнит характеристики техники по описанию из паспорта.
            </p>
            <a href="/register" className="mt-5 inline-block">
              <Button>Стать поставщиком</Button>
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
