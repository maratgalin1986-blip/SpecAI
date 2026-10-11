// The customer's order as a ride-like status line: Создан → Предложения →
// Исполнитель выбран → На объекте → Завершён, plus the one thing to do next.
// Derived from the order status, its bids and the booking made from the
// accepted bid. Pure, unit-tested.

export type TimelineStepId = 'created' | 'offers' | 'chosen' | 'onsite' | 'done';
export type StepState = 'done' | 'current' | 'upcoming';

export interface TimelineStep {
  id: TimelineStepId;
  title: string;
  state: StepState;
}

export interface TimelineInput {
  orderStatus: string; // OPEN | MATCHED | CANCELLED | PENDING_REVIEW
  bidCount: number;
  /** Status of the booking created from the accepted bid, if any. */
  bookingStatus?: string | null;
}

export interface Timeline {
  steps: TimelineStep[];
  cancelled: boolean;
  /** What the customer should do (or wait for) now. */
  next: { text: string; action?: { label: string; href: string } };
}

const TITLES: Record<TimelineStepId, string> = {
  created: 'Создан',
  offers: 'Предложения',
  chosen: 'Исполнитель выбран',
  onsite: 'На объекте',
  done: 'Завершён',
};

const ORDER: TimelineStepId[] = ['created', 'offers', 'chosen', 'onsite', 'done'];

/** How far the order went: index of the last finished step. */
function reached(input: TimelineInput): number {
  const booking = input.bookingStatus ?? null;
  if (booking === 'COMPLETED') return 4;
  if (booking === 'ACTIVE') return 3;
  if (input.orderStatus === 'MATCHED' && booking !== 'CANCELLED') return 2;
  if (input.bidCount > 0) return 1;
  return 0;
}

export function orderTimeline(input: TimelineInput, orderId = ''): Timeline {
  // Cancelling a booking reopens its order and unlinks it (api/bookings/[id]),
  // so only the order's own status says «cancelled».
  const cancelled = input.orderStatus === 'CANCELLED';
  const last = reached(input);
  const finished = last === 4;
  const steps = ORDER.map((id, index) => ({
    id,
    title: TITLES[id],
    state: (index <= last
      ? 'done'
      : index === last + 1 && !cancelled
        ? 'current'
        : 'upcoming') as StepState,
  }));
  // The finished order has nothing «current».
  if (finished) steps[4]!.state = 'done';

  const bookingsHref = '/dashboard#bookings';
  let next: Timeline['next'];
  if (cancelled) {
    next = {
      text: 'Заявка отменена. Если техника всё ещё нужна — создайте новую, исполнители ответят снова.',
      action: { label: 'Новая заявка', href: '/orders#new' },
    };
  } else if (finished) {
    next = {
      text: 'Работа завершена. Оцените исполнителя — отзыв помогает другим заказчикам.',
      action: { label: 'Оставить отзыв', href: bookingsHref },
    };
  } else if (last === 3) {
    next = { text: 'Техника на объекте. После смены исполнитель закроет заказ.' };
  } else if (last === 2) {
    next =
      input.bookingStatus === 'CONFIRMED'
        ? {
            text: 'Исполнитель подтвердил бронь — его телефон открыт в «Моих бронях». Договоритесь о подаче.',
            action: { label: 'Телефон исполнителя', href: bookingsHref },
          }
        : {
            text: 'Ждём, когда исполнитель подтвердит бронь. После этого откроются телефоны.',
            action: { label: 'Мои брони', href: bookingsHref },
          };
  } else if (last === 1) {
    next = {
      text: `Предложений: ${input.bidCount}. Сравните цену, рейтинг и надёжность — и выберите исполнителя.`,
      action: { label: 'К предложениям', href: orderId ? `/orders/${orderId}#offers` : '#offers' },
    };
  } else if (input.orderStatus === 'PENDING_REVIEW') {
    next = { text: 'Заявка на проверке у администратора.' };
  } else {
    next = {
      text: 'Заявку видят все исполнители. Как только кто-то предложит цену, она появится здесь и придёт на e-mail.',
    };
  }

  return { steps, cancelled, next };
}
