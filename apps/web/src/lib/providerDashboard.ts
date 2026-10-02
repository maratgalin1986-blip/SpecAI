// The provider cabinet's summary (active bookings, this month's income) and
// the «Почему нет заказов?» checklist. Pure functions over data the page
// loads, unit-tested.

/** Bookings that bring money: everything except waiting and cancelled ones. */
export const INCOME_STATUSES = ['CONFIRMED', 'ACTIVE', 'COMPLETED'] as const;

/** The first moment of the current month in Moscow (UTC+3 all year), as a UTC Date. */
export function monthStartMsk(now: Date = new Date()): Date {
  const msk = new Date(now.getTime() + 3 * 3600_000);
  return new Date(Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), 1) - 3 * 3600_000);
}

/** Income this month: confirmed, active and completed bookings that start this month. */
export function monthIncome(
  bookings: {
    status: string;
    startDate: Date;
    totalPrice: number | string | { toString(): string };
  }[],
  now: Date = new Date(),
): number {
  const from = monthStartMsk(now).getTime();
  const nextMonth = monthStartMsk(new Date(from + 32 * 86_400_000)).getTime();
  let sum = 0;
  for (const booking of bookings) {
    if (!(INCOME_STATUSES as readonly string[]).includes(booking.status)) continue;
    const start = booking.startDate.getTime();
    if (start < from || start >= nextMonth) continue;
    const value = Number(String(booking.totalPrice));
    if (Number.isFinite(value)) sum += value;
  }
  return Math.round(sum);
}

export interface ChecklistState {
  hasPhone: boolean;
  hasDescription: boolean;
  /** Published machines (not RETIRED). */
  machines: number;
  machinesWithPhoto: number;
  machinesWithHourly: number;
  machinesAvailable: number;
  hasBase: boolean;
  verified: boolean;
  /** Open orders on the board the company has not answered. */
  newOrders: number;
}

export interface ChecklistItem {
  id: 'machines' | 'profile' | 'photos' | 'base' | 'prices' | 'available' | 'verified' | 'answer';
  title: string;
  hint: string;
  done: boolean;
  href: string;
}

export function noOrdersChecklist(s: ChecklistState): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      id: 'machines',
      title: 'Техника опубликована',
      hint: 'Без машин в каталоге предложить цену по заявке нельзя.',
      done: s.machines > 0,
      href: '/provider#add-equipment',
    },
    {
      id: 'available',
      title: 'Хотя бы одна машина «Свободна»',
      hint: 'Занятые и стоящие на ремонте машины в предложения не попадают.',
      done: s.machinesAvailable > 0,
      href: '/provider#fleet',
    },
    {
      id: 'photos',
      title: 'Фото у каждой машины',
      hint: 'Заказчики чаще выбирают технику с реальными фото, а не с картинкой-примером.',
      done: s.machines > 0 && s.machinesWithPhoto >= s.machines,
      href: '/provider#fleet',
    },
    {
      id: 'prices',
      title: 'Цена за час указана',
      hint: 'Час — привычная единица для техники с машинистом; без неё карточка выглядит неполной.',
      done: s.machines > 0 && s.machinesWithHourly >= s.machines,
      href: '/provider#fleet',
    },
    {
      id: 'base',
      title: 'База на карте',
      hint: 'По базе заказчик видит, кто ближе, — подача быстрее и дешевле.',
      done: s.hasBase,
      href: '/provider#base',
    },
    {
      id: 'profile',
      title: 'Профиль компании заполнен',
      hint: 'Пара строк о компании и телефон для подтверждённых броней.',
      done: s.hasPhone && s.hasDescription,
      href: '/provider#profile',
    },
    {
      id: 'verified',
      title: 'Отметка «Проверен»',
      hint: 'Позвоните или напишите администратору: проверим ИНН и документы на технику.',
      done: s.verified,
      href: '/contacts',
    },
    {
      id: 'answer',
      title: 'Ответы на новые заявки',
      hint:
        s.newOrders > 0
          ? `Заявок в ленте без вашей цены: ${s.newOrders}. Кто отвечает первым, того выбирают чаще.`
          : 'Новых заявок нет — включите «На линии» и загляните позже.',
      done: s.newOrders === 0,
      href: '/provider#feed',
    },
  ];
  return items;
}

/** «4 из 8» for the checklist header. */
export function checklistProgress(items: ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((item) => item.done).length, total: items.length };
}
