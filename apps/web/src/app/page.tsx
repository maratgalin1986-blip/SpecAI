import { Button, Card } from '@specai/ui';
import { AGENT_PROFILES } from '@specai/shared';
import { SITE } from '@/lib/site';

const SERVICES = [
  { title: 'Экскаваторы', text: 'Котлованы, траншеи, планировка участка, демонтаж.' },
  { title: 'Автокраны', text: 'Монтаж конструкций, погрузка и подъём грузов.' },
  { title: 'Погрузчики', text: 'Фронтальные и мини-погрузчики для стройки и склада.' },
  { title: 'Самосвалы', text: 'Вывоз грунта и мусора, доставка сыпучих материалов.' },
  { title: 'Бульдозеры', text: 'Планировка, засыпка, расчистка территории.' },
  { title: 'Строительные услуги', text: 'Техника с оператором под ключ — от заявки до сдачи.' },
];

const STEPS = [
  { title: 'Опишите задачу', text: 'Своими словами — в чате ИИ-агенту или в форме заявки.' },
  { title: 'Получите варианты', text: 'Агент подберёт технику из каталога и посчитает стоимость.' },
  { title: 'Забронируйте', text: 'Подтвердите бронь или выберите лучшее предложение поставщиков.' },
  { title: 'Работайте', text: 'Следите за статусом в личном кабинете, оставьте отзыв.' },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-14">
      <section className="rounded-2xl bg-slate-900 px-6 py-12 text-white sm:px-10">
        <div className="text-sm font-semibold uppercase tracking-wide text-amber-400">
          {SITE.city} · {SITE.region}
        </div>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
          {SITE.name} — аренда спецтехники с ИИ-агентами
        </h1>
        <p className="mt-4 max-w-2xl text-slate-300">
          Экскаваторы, краны, погрузчики и самосвалы от проверенных владельцев. ИИ-агенты
          круглосуточно подберут технику под вашу задачу, посчитают стоимость и оформят заявку.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="/agents">
            <Button>Спросить ИИ-агента</Button>
          </a>
          <a
            href="/equipment"
            className="inline-flex items-center rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
          >
            Каталог техники
          </a>
          <a
            href={SITE.phoneHref}
            className="inline-flex items-center rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {SITE.phone}
          </a>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Техника и услуги</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((service) => (
            <Card key={service.title}>
              <h3 className="font-semibold">{service.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{service.text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Команда ИИ-агентов</h2>
        <p className="mt-1 text-slate-600">
          Каждый агент работает с живыми данными сайта: каталогом, заявками и вашими бронированиями.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AGENT_PROFILES.map((agent) => (
            <Card key={agent.id} className="flex flex-col">
              <div className="text-xs font-semibold uppercase text-amber-700">{agent.role}</div>
              <h3 className="mt-1 font-semibold">{agent.name}</h3>
              <p className="mt-1 flex-1 text-sm text-slate-600">{agent.description}</p>
              <a
                href={`/agents?agent=${agent.id}`}
                className="mt-3 text-sm font-medium text-amber-700 hover:underline"
              >
                Написать →
              </a>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold">Как это работает</h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-600 text-sm font-bold text-white">
                {index + 1}
              </div>
              <h3 className="mt-3 font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 sm:grid-cols-2 sm:p-10">
        <div>
          <h2 className="text-2xl font-bold">Владеете техникой?</h2>
          <p className="mt-2 text-slate-700">
            Разместите парк на {SITE.name}, получайте заявки клиентов и делайте ставки. ИИ заполнит
            характеристики техники по описанию из паспорта.
          </p>
          <a href="/register" className="mt-4 inline-block">
            <Button>Стать поставщиком</Button>
          </a>
        </div>
        <div className="flex flex-col gap-2 text-slate-700">
          <h3 className="font-semibold">Контакты</h3>
          <a href={SITE.phoneHref} className="text-lg font-semibold text-slate-900">
            {SITE.phone}
          </a>
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
          <span>
            {SITE.city}, {SITE.region}
          </span>
          <span className="text-sm">{SITE.workingHours}</span>
        </div>
      </section>
    </div>
  );
}
