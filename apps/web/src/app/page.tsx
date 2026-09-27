import { prisma } from '@specai/database';
import { Button, Card } from '@specai/ui';
import { pluralizeRu } from '@/lib/pluralize';

export const dynamic = 'force-dynamic';

interface PopularCategory {
  id: string;
  name: string;
  description: string | null;
  equipmentCount: number;
}

const STEPS = [
  {
    title: 'Опишите задачу',
    text: 'Расскажите, какие работы предстоят, где и в какие сроки. ИИ-ассистент подскажет, какая техника подойдёт.',
  },
  {
    title: 'Получите предложения от поставщиков',
    text: 'Компании поблизости откликнутся на заявку с конкретной техникой и ценой — выбирайте лучший вариант.',
  },
  {
    title: 'Бронируйте и оплачивайте онлайн',
    text: 'Подтвердите бронирование, оплатите безопасно через Stripe и следите за статусом аренды в кабинете.',
  },
];

const PROVIDER_BENEFITS = [
  'Бесплатное размещение техники в каталоге',
  'Заявки от клиентов рядом с вашей базой',
  'ИИ извлекает характеристики из вашего описания',
  'Онлайн-оплата и управление бронированиями',
];

async function loadPopularCategories(): Promise<PopularCategory[] | null> {
  try {
    const categories = await prisma.equipmentCategory.findMany({
      where: { parentId: null },
      include: { _count: { select: { equipment: true } } },
      orderBy: [{ equipment: { _count: 'desc' } }, { name: 'asc' }],
      take: 6,
    });

    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      equipmentCount: category._count.equipment,
    }));
  } catch (error) {
    console.error('Failed to load popular categories for the home page', error);
    return null;
  }
}

export default async function HomePage() {
  const categories = await loadPopularCategories();

  return (
    <div className="flex flex-col gap-14 sm:gap-20">
      <section className="flex flex-col gap-6 pt-4 sm:pt-10">
        <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
          Маркетплейс спецтехники
        </span>
        <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
          Аренда спецтехники с ИИ-подбором
        </h1>
        <p className="max-w-2xl text-base text-slate-600 sm:text-lg">
          Экскаваторы, краны, погрузчики и самосвалы от проверенных поставщиков. Опишите работы —
          SpecAI подберёт подходящую технику, а поставщики предложат цену.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a href="/equipment" className="flex">
            <Button className="w-full px-6 py-3 text-base sm:w-auto">Найти технику</Button>
          </a>
          <a href="/recommend" className="flex">
            <Button variant="secondary" className="w-full px-6 py-3 text-base sm:w-auto">
              Подобрать по описанию работ
            </Button>
          </a>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Как это работает</h2>
          <p className="mt-1 text-slate-600">Три шага от задачи до техники на объекте.</p>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <Card className="flex h-full flex-col gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-600 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-slate-600">{step.text}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Популярные категории</h2>
            <p className="mt-1 text-slate-600">Техника для любых строительных и земляных работ.</p>
          </div>
          <a href="/equipment" className="text-sm font-medium text-amber-700 hover:text-amber-800">
            Весь каталог →
          </a>
        </div>

        {categories === null ? (
          <Card>
            <p className="text-sm text-slate-600">
              Категории временно недоступны. Перейдите в{' '}
              <a href="/equipment" className="font-medium text-amber-700">
                каталог техники
              </a>
              , чтобы посмотреть все предложения.
            </p>
          </Card>
        ) : categories.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-600">
              Категории ещё не добавлены. Загляните в{' '}
              <a href="/equipment" className="font-medium text-amber-700">
                каталог техники
              </a>
              .
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <a key={category.id} href={`/equipment?category=${encodeURIComponent(category.id)}`}>
                <Card className="flex h-full flex-col gap-2 hover:border-amber-400">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{category.name}</h3>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                      {pluralizeRu(category.equipmentCount, ['единица', 'единицы', 'единиц'])}
                    </span>
                  </div>
                  {category.description && (
                    <p className="text-sm text-slate-600">{category.description}</p>
                  )}
                </Card>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-slate-900 px-6 py-10 text-white sm:px-10 sm:py-14">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Для поставщиков</h2>
            <p className="text-slate-300">
              Ваша техника простаивает? Разместите её на SpecAI и получайте заявки от заказчиков без
              звонков и посредников.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a href="/register" className="flex">
                <Button className="w-full px-6 py-3 text-base sm:w-auto">Стать поставщиком</Button>
              </a>
              <a href="/orders" className="flex">
                <Button
                  variant="ghost"
                  className="w-full px-6 py-3 text-base text-white hover:bg-slate-800 sm:w-auto"
                >
                  Смотреть заявки
                </Button>
              </a>
            </div>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PROVIDER_BENEFITS.map((benefit) => (
              <li
                key={benefit}
                className="flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-sm text-slate-200"
              >
                <span aria-hidden="true" className="mt-0.5 text-amber-400">
                  ✓
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
