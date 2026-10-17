import { useSyncExternalStore } from 'react';
import { STORAGE_KEYS, getItem, removeItem, setItem } from './storage';

/**
 * Ненавязчивые подсказки на каждом шаге (владелец, 2026-10-17): маленькая
 * карточка с одной-двумя фразами и «Понятно». Закрытая подсказка больше не
 * показывается — список закрытых хранится на телефоне одной строкой. Если
 * хранилище недоступно, подсказка прячется до перезапуска приложения.
 * «Показать подсказки снова» (экран «Как пользоваться») очищает список.
 */
export type HintIcon =
  | 'bulb-outline'
  | 'map-outline'
  | 'calendar-outline'
  | 'notifications-outline'
  | 'checkmark-done-outline'
  | 'flash-outline'
  | 'radio-outline'
  | 'construct-outline'
  | 'camera-outline'
  | 'pricetag-outline'
  | 'briefcase-outline'
  | 'swap-horizontal';

export interface HintText {
  icon: HintIcon;
  text: string;
}

export const HINTS = {
  'home.order': {
    icon: 'map-outline',
    text: 'Как заказать: выберите вид техники и нажмите «Заказать». Нажмите на карту — адрес объекта подставится сам.',
  },
  'home.sheet': {
    icon: 'calendar-outline',
    text: 'По адресу исполнители считают подачу — укажите его точнее. «Нужна сейчас» — одна смена сегодня, «На дату» — выберите день и срок.',
  },
  'orders.list': {
    icon: 'notifications-outline',
    text: 'Предложения исполнителей приходят сюда и в уведомления. Откройте заявку, чтобы сравнить цены.',
  },
  'order.bids': {
    icon: 'checkmark-done-outline',
    text: 'Сравните цену и машину и нажмите «Выбрать». Телефон исполнителя появится, когда он подтвердит бронь.',
  },
  'feed.start': {
    icon: 'flash-outline',
    text: 'Отметьте машину «Свободна» и нажмите «Выйти на линию» — появятся заявки рядом. В заявке нажмите «Предложить цену».',
  },
  'feed.online': {
    icon: 'radio-outline',
    text: 'Пока вы на линии и приложение открыто, заказчики видят вашу машину на карте с ценой. Держите её «Свободна» — занятую на карте не видно.',
  },
  'fleet.list': {
    icon: 'construct-outline',
    text: 'Добавьте машину с ценой за смену и фото — таких выбирают чаще. Статус «Свободна» значит, что машину можно заказать.',
  },
  'equipment.form': {
    icon: 'camera-outline',
    text: 'Цена за смену (8 часов) обязательна, за час — по желанию. Фото своей машины вызывает больше доверия, чем картинка из интернета.',
  },
  'bid.form': {
    icon: 'pricetag-outline',
    text: 'Итог = подача + цена смены × число смен. Заказчик видит одну сумму, подача уже в ней.',
  },
  'jobs.list': {
    icon: 'briefcase-outline',
    text: 'Когда заказчик выберет вас, бронь появится здесь — подтвердите её. После подтверждения откроется телефон заказчика, а в день работы отмечайте смену.',
  },
  'profile.switch': {
    icon: 'swap-horizontal',
    text: 'Один вход — два режима: «Заказчик» заказывает технику, «Исполнитель» работает на своей. Переключатель есть и на главном экране.',
  },
  'profile.become': {
    icon: 'swap-horizontal',
    text: 'Есть своя техника? Нажмите «Стать исполнителем» — заказывать технику вы сможете и дальше, с того же входа.',
  },
} as const satisfies Record<string, HintText>;

export type HintId = keyof typeof HINTS;

export function isHintId(value: unknown): value is HintId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(HINTS, value);
}

/** Сохранённая строка → закрытые подсказки. Мусор и неизвестные ключи пропускаются. */
export function parseDismissed(stored: string | null | undefined): Set<HintId> {
  if (!stored) return new Set();
  try {
    const parsed: unknown = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed.filter(isHintId) : []);
  } catch {
    return new Set();
  }
}

/** Первая ещё не закрытая подсказка из списка (на экране — не больше одной). */
export function firstOpenHint(
  ids: readonly HintId[],
  dismissed: ReadonlySet<HintId>,
): HintId | null {
  return ids.find((id) => !dismissed.has(id)) ?? null;
}

export interface HintStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export interface HintsState {
  /** Пока список не прочитан, подсказки не показываются (не мигают). */
  loaded: boolean;
  dismissed: ReadonlySet<HintId>;
}

export function createHintStore(storage: HintStorage, key: string = STORAGE_KEYS.hints) {
  let state: HintsState = { loaded: false, dismissed: new Set() };
  const listeners = new Set<() => void>();
  let loading: Promise<void> | null = null;
  /** «Показать снова» нажали, пока список ещё читался: прочитанное не возвращаем. */
  let resetDuringLoad = false;

  const emit = (next: HintsState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const load = (): Promise<void> => {
    loading ??= (async () => {
      let stored: string | null = null;
      try {
        stored = await storage.getItem(key);
      } catch {
        // Не прочитали — подсказки покажутся, закрытые спрячутся до перезапуска.
      }
      // Закрытые до окончания чтения не теряются; после «Показать снова» старый список не нужен.
      const fromStorage = resetDuringLoad ? [] : parseDismissed(stored);
      emit({ loaded: true, dismissed: new Set([...fromStorage, ...state.dismissed]) });
    })();
    return loading;
  };

  return {
    load,
    getSnapshot: (): HintsState => state,
    subscribe(listener: () => void) {
      void load();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Скрыть навсегда; при ошибке хранилища — до перезапуска приложения. */
    async dismiss(id: HintId): Promise<void> {
      if (state.dismissed.has(id)) return;
      emit({ ...state, dismissed: new Set(state.dismissed).add(id) });
      // Сначала дочитываем сохранённый список, чтобы не затереть закрытые раньше.
      await load();
      try {
        await storage.setItem(key, JSON.stringify([...state.dismissed]));
      } catch {
        // Хранилище недоступно — подсказка спрятана только в памяти.
      }
    },
    /** «Показать подсказки снова». */
    async reset(): Promise<void> {
      if (!state.loaded) resetDuringLoad = true;
      emit({ loaded: true, dismissed: new Set() });
      try {
        await storage.removeItem(key);
      } catch {
        // Ключа могло не быть.
      }
    },
  };
}

export type HintStore = ReturnType<typeof createHintStore>;

export const hintStore = createHintStore({ getItem, setItem, removeItem });

export function useHints(): HintsState {
  return useSyncExternalStore(hintStore.subscribe, hintStore.getSnapshot, hintStore.getSnapshot);
}

export const dismissHint = (id: HintId) => hintStore.dismiss(id);
export const resetHints = () => hintStore.reset();
