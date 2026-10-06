// The assistant that walks every user from the first visit to a finished job
// and a comment: a checklist of steps and «the next step» with a link. Pure
// function over a snapshot of the user's data (lib/guideState.ts loads it), so
// it works without any AI key and is unit-tested.

export type GuideRole = 'GUEST' | 'CUSTOMER' | 'PROVIDER';

export interface GuideUser {
  role?: string | null;
  companyId?: string | null;
  name?: string | null;
}

/** Snapshot of what the user has done. Missing fields count as zero. */
export interface GuideState {
  // Customer
  orders?: number;
  /** Open orders without any bid yet (the oldest first). */
  openOrdersWithoutBids?: number;
  waitingOrderId?: string | null;
  /** Open orders with bids the customer has not chosen from. */
  ordersWithBids?: number;
  choiceOrderId?: string | null;
  // Both sides: bookings by status (customer — own, provider — of its fleet)
  bookingsPending?: number;
  bookingsConfirmed?: number;
  bookingsActive?: number;
  bookingsCompleted?: number;
  /** Bookings that were not cancelled. */
  bookingsTotal?: number;
  reviewsWritten?: number;
  commentsWritten?: number;
  // Provider
  equipmentCount?: number;
  equipmentWithPrice?: number;
  hasBase?: boolean;
  hasPinNote?: boolean;
  /** Open orders on the board this provider has not bid on. */
  newOrders?: number;
  bidsSent?: number;
}

export interface GuideLink {
  label: string;
  /** Path on the site. */
  href: string;
  /** Route in the mobile app (expo-router), when it differs or exists. */
  app?: string;
}

export interface GuideStep {
  id: string;
  title: string;
  hint: string;
  done: boolean;
  action?: GuideLink;
}

export interface GuideResult {
  role: GuideRole;
  title: string;
  steps: GuideStep[];
  /** What to do now: the first unfinished step, or an urgent action. */
  next: GuideStep;
  progress: { done: number; total: number };
}

const n = (value: number | undefined) => value ?? 0;

const plural = (count: number, forms: [string, string, string]) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const form =
    mod10 === 1 && mod100 !== 11
      ? forms[0]
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? forms[1]
        : forms[2];
  return `${count} ${form}`;
};

export function guideRole(user: GuideUser | null | undefined): GuideRole {
  if (!user) return 'GUEST';
  if (user.role === 'PROVIDER_ADMIN' && user.companyId) return 'PROVIDER';
  return 'CUSTOMER';
}

function guestSteps(): GuideStep[] {
  return [
    {
      id: 'browse',
      title: 'Посмотрите технику и исполнителей',
      hint: 'Каталог с ценами и карта открыты без входа. Парк СпецПласт16 — первым в списке.',
      done: false,
      action: { label: 'Открыть каталог', href: '/equipment', app: '/(tabs)' },
    },
    {
      id: 'register',
      title: 'Зарегистрируйтесь',
      hint: 'Заказчику — чтобы оставить заявку и бронировать, исполнителю — чтобы разместить технику. Бесплатно.',
      done: false,
      action: { label: 'Зарегистрироваться', href: '/register', app: '/(auth)/register' },
    },
    {
      id: 'order',
      title: 'Оставьте заявку или выберите технику',
      hint: 'Исполнители, включая парк СпецПласт16, пришлют предложения с ценой, вы выберете лучшее.',
      done: false,
      action: { label: 'Оставить заявку', href: '/orders', app: '/orders/new' },
    },
  ];
}

function customerSteps(s: GuideState): GuideStep[] {
  const bookings = n(s.bookingsTotal);
  const confirmedOrLater = n(s.bookingsConfirmed) + n(s.bookingsActive) + n(s.bookingsCompleted);
  const chose = bookings > 0;
  const hasOffers = n(s.ordersWithBids) > 0 || chose;
  return [
    {
      id: 'register',
      title: 'Регистрация',
      hint: 'Аккаунт создан.',
      done: true,
    },
    {
      id: 'order',
      title: 'Оставьте заявку или выберите технику',
      hint: 'Опишите задачу — исполнители пришлют цены. Или выберите машину в каталоге и на карте.',
      done: n(s.orders) > 0 || bookings > 0,
      action: { label: 'Оставить заявку', href: '/orders', app: '/orders/new' },
    },
    {
      id: 'offers',
      title: 'Дождитесь предложений',
      hint:
        n(s.openOrdersWithoutBids) > 0
          ? 'Заявка опубликована, исполнители её видят. Предложения появятся на странице заявки.'
          : 'Исполнители присылают цену и машину в ответ на заявку.',
      done: hasOffers,
      action: s.waitingOrderId
        ? {
            label: 'Открыть заявку',
            href: `/orders/${s.waitingOrderId}`,
            app: `/orders/${s.waitingOrderId}`,
          }
        : { label: 'Мои заявки', href: '/dashboard#orders', app: '/(tabs)/orders' },
    },
    {
      id: 'choose',
      title: 'Выберите исполнителя',
      hint: 'Сравните цены и нажмите «Принять» — бронь создастся сама.',
      // Offers waiting on an open order reopen the step.
      done: chose && n(s.ordersWithBids) === 0,
      action: s.choiceOrderId
        ? {
            label: 'Выбрать предложение',
            href: `/orders/${s.choiceOrderId}`,
            app: `/orders/${s.choiceOrderId}`,
          }
        : { label: 'Мои заявки', href: '/dashboard#orders', app: '/(tabs)/orders' },
    },
    {
      id: 'confirmed',
      title: confirmedOrLater > 0 ? 'Бронь подтверждена' : 'Дождитесь подтверждения брони',
      hint: 'Исполнитель подтверждает бронь — после этого вы увидите его телефон.',
      done: confirmedOrLater > 0,
      action: { label: 'Мои брони', href: '/dashboard#bookings', app: '/(tabs)/bookings' },
    },
    {
      id: 'work',
      title: n(s.bookingsCompleted) > 0 ? 'Работа выполнена' : 'Дождитесь окончания работ',
      hint: 'Когда техника отработает, исполнитель завершит бронь.',
      done: n(s.bookingsCompleted) > 0,
      action: { label: 'Мои брони', href: '/dashboard#bookings', app: '/(tabs)/bookings' },
    },
    {
      id: 'feedback',
      title: 'Оставьте отзыв или комментарий',
      hint: 'Расскажите, как прошла работа: это помогает другим заказчикам выбрать исполнителя.',
      done: n(s.commentsWritten) > 0 || n(s.reviewsWritten) > 0,
      action: { label: 'Мои брони', href: '/dashboard#bookings', app: '/(tabs)/bookings' },
    },
  ];
}

function providerSteps(s: GuideState): GuideStep[] {
  const handled = n(s.bookingsConfirmed) + n(s.bookingsActive) + n(s.bookingsCompleted);
  const started = n(s.bookingsActive) + n(s.bookingsCompleted);
  return [
    { id: 'register', title: 'Регистрация', hint: 'Аккаунт исполнителя создан.', done: true },
    {
      id: 'base',
      title: 'Поставьте точку на карте',
      hint: 'Заказчики видят вас на карте рядом с объектом.',
      done: Boolean(s.hasBase),
      action: { label: 'Указать базу', href: '/provider#base', app: '/(tabs)/provider' },
    },
    // Only once the point is there: the note is what customers read under it.
    ...(s.hasBase
      ? [
          {
            id: 'pin-note',
            title: 'Добавьте подпись к значку',
            hint: 'Коротко о цене и условиях, например «от 2 500 ₽/ч, подача за 2 часа».',
            done: Boolean(s.hasPinNote),
            action: { label: 'Добавить подпись', href: '/provider#base', app: '/(tabs)/provider' },
          },
        ]
      : []),
    {
      id: 'equipment',
      title: 'Добавьте технику с ценой',
      hint: 'Фото, характеристики и цена за час или смену — и машина появится в каталоге.',
      done: n(s.equipmentWithPrice ?? s.equipmentCount) > 0,
      action: {
        label: 'Добавить технику',
        href: '/provider#add-equipment',
        app: '/provider/equipment/new',
      },
    },
    {
      id: 'bids',
      title: 'Отвечайте на заявки',
      hint:
        n(s.newOrders) > 0
          ? `На доске ${plural(n(s.newOrders), ['новая заявка', 'новые заявки', 'новых заявок'])} — предложите машину и цену.`
          : 'Заказчики публикуют заявки — предложите машину и цену.',
      done: n(s.bidsSent) > 0,
      action: { label: 'Заявки заказчиков', href: '/orders', app: '/provider/orders' },
    },
    {
      id: 'confirm',
      title: 'Подтверждайте брони',
      hint:
        n(s.bookingsPending) > 0
          ? `Ждут подтверждения: ${plural(n(s.bookingsPending), ['бронь', 'брони', 'броней'])}.`
          : 'Новая бронь ждёт вашего «Подтвердить» — заказчик получит уведомление.',
      done: handled > 0 && n(s.bookingsPending) === 0,
      action: { label: 'Брони', href: '/provider#bookings', app: '/(tabs)/provider' },
    },
    {
      id: 'start',
      title: 'Начните аренду',
      hint:
        n(s.bookingsConfirmed) > 0
          ? `Подтверждено: ${plural(n(s.bookingsConfirmed), ['бронь', 'брони', 'броней'])}. В день работ нажмите «Начать аренду».`
          : 'В день работ нажмите «Начать аренду» у подтверждённой брони.',
      done: started > 0 && n(s.bookingsConfirmed) === 0,
      action: { label: 'Брони', href: '/provider#bookings', app: '/(tabs)/provider' },
    },
    {
      id: 'complete',
      title: 'Завершайте работу',
      hint:
        n(s.bookingsActive) > 0
          ? `В работе: ${plural(n(s.bookingsActive), ['бронь', 'брони', 'броней'])}. Отметьте «Завершить», когда закончите.`
          : 'После смены нажмите «Завершить» — заказчик сможет оставить отзыв.',
      done: n(s.bookingsCompleted) > 0 && n(s.bookingsActive) === 0,
      action: { label: 'Брони', href: '/provider#bookings', app: '/(tabs)/provider' },
    },
    {
      id: 'comment',
      title: 'Оставьте комментарий о заказчике',
      hint: 'Помогите другим исполнителям: как прошла работа с заказчиком.',
      done: n(s.commentsWritten) > 0,
      action: { label: 'Брони', href: '/provider#bookings', app: '/(tabs)/provider' },
    },
  ];
}

/** Urgent work that beats the order of the checklist. */
function urgentStep(role: GuideRole, steps: GuideStep[], s: GuideState): GuideStep | null {
  const byId = (id: string) => steps.find((step) => step.id === id) ?? null;
  if (role === 'PROVIDER') {
    if (n(s.bookingsPending) > 0) return byId('confirm');
    if (n(s.bookingsActive) > 0) return byId('complete');
    if (n(s.bookingsConfirmed) > 0) return byId('start');
  }
  if (role === 'CUSTOMER' && n(s.ordersWithBids) > 0) return byId('choose');
  return null;
}

/** When everything is done: what to do again. */
function repeatStep(role: GuideRole, s: GuideState): GuideStep {
  if (role === 'PROVIDER') {
    return {
      id: 'repeat',
      title: 'Ищите новые заявки',
      hint:
        n(s.newOrders) > 0
          ? `На доске ${plural(n(s.newOrders), ['новая заявка', 'новые заявки', 'новых заявок'])}.`
          : 'Все шаги пройдены. Новые заявки появятся на доске.',
      done: false,
      action: { label: 'Заявки заказчиков', href: '/orders', app: '/provider/orders' },
    };
  }
  return {
    id: 'repeat',
    title: 'Нужна ещё техника?',
    hint: 'Все шаги пройдены. Оставьте новую заявку — исполнители пришлют цены.',
    done: false,
    action: { label: 'Новая заявка', href: '/orders', app: '/orders/new' },
  };
}

export function nextSteps(user: GuideUser | null | undefined, state: GuideState = {}): GuideResult {
  const role = guideRole(user);
  const steps =
    role === 'GUEST'
      ? guestSteps()
      : role === 'PROVIDER'
        ? providerSteps(state)
        : customerSteps(state);
  const done = steps.filter((step) => step.done).length;
  const next =
    urgentStep(role, steps, state) ?? steps.find((step) => !step.done) ?? repeatStep(role, state);
  const title =
    role === 'GUEST'
      ? 'Как заказать технику'
      : role === 'PROVIDER'
        ? 'Путь исполнителя'
        : 'Путь заказчика';
  return { role, title, steps, next, progress: { done, total: steps.length } };
}

const WHAT_NEXT =
  /что\s+(?:мне\s+)?(?:дальше|делать)|следующ\p{L}*\s+шаг|с\s+чего\s+начать|^\s*дальше\s*\??\s*$/iu;

/** Whether a chat message asks the assistant «what next?». */
export function asksWhatNext(text: string): boolean {
  return WHAT_NEXT.test(text);
}

/**
 * The guide as a chat answer. `links: 'markdown'` makes [label](/path) for the
 * site chat; 'plain' is for the app, where buttons do the navigation.
 */
export function guideReply(result: GuideResult, links: 'markdown' | 'plain' = 'markdown'): string {
  const link = (action?: GuideLink) =>
    action ? (links === 'markdown' ? ` → [${action.label}](${action.href})` : '') : '';
  const lines = [
    // «Нужна ещё техника?» keeps its question mark without a dot after it.
    `Ваш следующий шаг: ${result.next.title}${/[.!?…]$/.test(result.next.title) ? '' : '.'}`,
    `${result.next.hint}${link(result.next.action)}`,
    '',
    `${result.title} (${result.progress.done} из ${result.progress.total}):`,
    ...result.steps.map((step) => `${step.done ? '✅' : '⬜'} ${step.title}`),
  ];
  return lines.join('\n');
}
