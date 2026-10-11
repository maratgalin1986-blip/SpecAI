import { OrderBoardCard } from '@/components/OrderBoardCard';
import { loadMarketplaceCounters, loadOrderBoard } from '@/lib/orderBoardData';
import { pluralizeRu } from '@/lib/pluralize';
import { SITE } from '@/lib/site';

// The marketplace block of the home page (owner, 2026-10-11: the site must
// visibly be a platform for orders and providers). Two doors — customer and
// provider — with live counters, and the newest open orders as a mini-board.
// Graphite + signal, as in the cabinets. Without a database the counters are
// hidden and the mini-board shows its empty state.

const MINI_BOARD_SIZE = 6;

export async function MarketplaceBlock() {
  const [counters, board] = await Promise.all([
    loadMarketplaceCounters(),
    loadOrderBoard(
      { page: 1, group: null, city: null, when: 'all', sort: 'newest' },
      { pageSize: MINI_BOARD_SIZE },
    ),
  ]);

  const doors = [
    {
      eyebrow: 'Я заказчик',
      title: 'Разместить заявку',
      text: `Опишите задачу — исполнители со своей техникой и машинистами, включая парк ${SITE.name}, пришлют цены. Вы выбираете, сервис бесплатный.`,
      href: '/orders#new',
      action: 'Разместить заявку',
      counter: counters
        ? `${pluralizeRu(counters.providers, ['исполнитель', 'исполнителя', 'исполнителей'])} · ${pluralizeRu(counters.machines, ['машина', 'машины', 'машин'])}`
        : null,
      emoji: '🧾',
      dark: false,
    },
    {
      eyebrow: 'Я исполнитель',
      title: 'Встать на линию',
      text: 'Своя техника? Подключитесь, опубликуйте парк со своими ценами и предлагайте цену на заявки заказчиков. Конкуренты ваших цен не видят.',
      href: '/register?type=provider',
      action: 'Встать на линию',
      counter: counters
        ? `${pluralizeRu(counters.openOrders, ['открытая заявка', 'открытые заявки', 'открытых заявок'])} ждут цены`
        : null,
      emoji: '🚛',
      dark: true,
    },
  ];

  return (
    <section className="flex flex-col gap-6" aria-labelledby="marketplace-title">
      <div>
        <p className="cab-eyebrow">Площадка заказов и исполнителей</p>
        <h2
          id="marketplace-title"
          className="mt-2 max-w-3xl text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl"
        >
          Заказчики размещают заявки, исполнители предлагают цену
        </h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {doors.map((door) => (
          <a
            key={door.href}
            href={door.href}
            data-marketplace-door={door.dark ? 'provider' : 'customer'}
            className={`group flex min-h-[240px] flex-col gap-4 rounded-cab p-6 shadow-sm transition sm:p-8 ${
              door.dark
                ? 'bg-graphite-900 text-white hover:bg-graphite-800'
                : 'border border-graphite-100 bg-white text-graphite-950 hover:border-signal-400'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <p className={`cab-eyebrow ${door.dark ? 'text-signal-300' : ''}`}>{door.eyebrow}</p>
              <span aria-hidden className="text-3xl leading-none">
                {door.emoji}
              </span>
            </div>
            <h3 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{door.title}</h3>
            <p
              className={`text-sm leading-relaxed ${door.dark ? 'text-graphite-200' : 'text-graphite-600'}`}
            >
              {door.text}
            </p>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
              <span className="cab-action group-hover:bg-signal-400">{door.action} →</span>
              {door.counter && (
                <span
                  className={`font-mono text-sm tabular-nums ${door.dark ? 'text-graphite-300' : 'text-graphite-500'}`}
                  data-marketplace-counter
                >
                  {door.counter}
                </span>
              )}
            </div>
          </a>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-bold tracking-tight">
            {board.total > 0
              ? `Свежие заявки · ${pluralizeRu(board.total, ['открытая', 'открытые', 'открытых'])}`
              : 'Свежие заявки'}
          </h3>
          <a
            href="/orders#board"
            className="group inline-flex min-h-[44px] items-center gap-2 rounded-full border border-graphite-200 px-5 py-2.5 text-sm font-semibold transition hover:border-graphite-900"
          >
            Все заявки
            <span className="transition group-hover:translate-x-0.5">→</span>
          </a>
        </div>
        {board.items.length === 0 ? (
          <p className="rounded-cab border border-dashed border-graphite-200 bg-white p-6 text-sm text-graphite-600">
            Открытых заявок сейчас нет —{' '}
            <a href="/orders#new" className="font-semibold text-signal-700 hover:underline">
              разместите первую
            </a>
            , исполнители ответят ценами.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {board.items.map((item) => (
              <OrderBoardCard key={item.card.id} card={item.card} viewer="public" compact />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
