import type { BaseMachine, LiveMachine } from './api';
import { pluralizeRu } from './format';

/**
 * Что уходит в карту (window.setLive в providersMapHtml): короткая метка на
 * значке — первое слово названия машины или категории, подпись-пузырь с
 * сервера (мелкая первая строка «Я на линии» и строка «машина · цена · имя»),
 * заметка машиниста и признак парка СпецПласт16 (цвет бренда).
 */
export interface LivePin {
  equipmentId: string | null;
  lat: number;
  lon: number;
  short: string;
  /** Мелкая первая строка пузыря («Я на линии»). */
  head: string;
  /** Основная строка пузыря («Экскаватор JCB · от 4 000 ₽/ч · Марат Г.»). */
  body: string;
  note: string | null;
  house: boolean;
}

/** Пузырей с постоянной подписью на карте не больше этого; дальше — по нажатию. */
export const LIVE_PERMANENT_MAX = 8;

export function shortLabel(machine: Pick<LiveMachine, 'equipment' | 'company'>): string {
  const source = machine.equipment?.category ?? machine.equipment?.name ?? machine.company.name;
  const word = source.split(/[\s,(]/).find((part) => part.length > 0) ?? '•';
  return word.length > 6 ? `${word.slice(0, 5)}.` : word;
}

/** «Я на линии · JCB · от 4 000 ₽/ч · Марат Г.» → мелкая первая строка и остальное. */
export function splitBubble(bubble: string): { head: string; body: string } {
  const separator = ' · ';
  const index = bubble.indexOf(separator);
  if (index < 0) return { head: bubble, body: '' };
  return { head: bubble.slice(0, index), body: bubble.slice(index + separator.length) };
}

export function toLivePins(machines: LiveMachine[]): LivePin[] {
  return machines.map((machine) => ({
    equipmentId: machine.equipment?.id ?? null,
    lat: machine.lat,
    lon: machine.lon,
    short: shortLabel(machine),
    ...splitBubble(machine.bubble),
    note: machine.note?.trim() || null,
    house: machine.company.isHouse,
  }));
}

/**
 * Точка машин СпецПласт16 на базе (window.setBase в providersMapHtml). Машины
 * одной базы стоят в одной точке — это одна метка: подпись одной машины или
 * «N машин · от … ₽/ч», нажатие открывает список, из него — страница машины.
 */
export interface BasePin {
  lat: number;
  lon: number;
  /** «СпецПласт16 · на базе» — мелкая первая строка пузыря. */
  head: string;
  /** «JCB 3CX · от 2 500 ₽/ч» или «12 машин · от 2 500 ₽/ч». */
  body: string;
  items: { equipmentId: string; name: string; price: string }[];
}

/** «СпецПласт16 · JCB 3CX · от 2 500 ₽/ч · на базе» → голова «СпецПласт16 · на базе» и середина. */
export function splitBaseBubble(bubble: string): { head: string; body: string } {
  const parts = bubble.split(' · ');
  if (parts.length < 3) return { head: bubble, body: '' };
  return {
    head: `${parts[0]} · ${parts[parts.length - 1]}`,
    body: parts.slice(1, -1).join(' · '),
  };
}

export function toBasePins(base: BaseMachine[]): BasePin[] {
  const groups = new Map<string, BaseMachine[]>();
  for (const machine of base) {
    const key = `${machine.lat.toFixed(4)},${machine.lon.toFixed(4)}`;
    groups.set(key, [...(groups.get(key) ?? []), machine]);
  }
  return [...groups.values()].map((machines) => {
    const first = machines[0]!;
    const { head, body } = splitBaseBubble(first.bubble);
    const priced = machines
      .filter((machine) => machine.equipment.hourlyRate > 0)
      .sort((a, b) => a.equipment.hourlyRate - b.equipment.hourlyRate)[0];
    return {
      lat: first.lat,
      lon: first.lon,
      head,
      body:
        machines.length === 1
          ? body
          : [pluralizeRu(machines.length, ['машина', 'машины', 'машин']), priced?.priceText ?? null]
              .filter(Boolean)
              .join(' · '),
      items: machines.map((machine) => ({
        equipmentId: machine.equipment.id,
        name: machine.equipment.name,
        price: machine.priceText,
      })),
    };
  });
}

/** Как часто карта заказчика перечитывает технику на линии. */
export const LIVE_REFRESH_MS = 30_000;
/**
 * Как часто телефон исполнителя на линии отправляет своё положение — и при
 * стоящей машине (сервер считает строку свежей 15 минут).
 */
export const REPORT_INTERVAL_MS = 60_000;
/** Сдвиг, после которого положение отправляется раньше таймера. */
export const REPORT_DISTANCE_M = 150;

/** Текст в карточке «На линии» о положении. */
export function positionStatus(
  permission: 'unknown' | 'granted' | 'denied',
  lastSentAt: Date | null,
  now: Date = new Date(),
  background = false,
): string {
  if (permission === 'denied') return 'Нет доступа к геопозиции — заказчики не видят вас на карте';
  if (!lastSentAt) return 'Определяем положение…';
  const minutes = Math.round((now.getTime() - lastSentAt.getTime()) / 60_000);
  const where =
    minutes < 1 ? 'Вы на карте у заказчиков' : `На карте, обновлено ${minutes} мин назад`;
  return background ? `${where} · работает и с выключенным экраном` : where;
}

// ---------------------------------------------------------------------------
// «Утром на линию — вечером автоматически снимаемся» (владелец, 2026-10-17).
// Вечером линия выключается сама — по времени ТЕЛЕФОНА (Россия большая:
// у машиниста в Новосибирске свой вечер). То же правило на сервере
// (apps/web/src/lib/lineDay.ts) — страховка для телефона, оставленного включённым.
// ---------------------------------------------------------------------------

/** Час (по времени телефона), в который утренняя линия выключается сама. */
export const LINE_EVENING_OFF_HOUR = 21;

/** Почему линия выключилась сама: вечером в LINE_EVENING_OFF_HOUR или в полночь (поздняя линия). */
export type LineAutoOffReason = 'evening' | 'midnight';

/**
 * Календарный день («2026-10-17») и час момента: по времени телефона, а в
 * тестах — в заданном часовом поясе.
 */
export function localDayHour(date: Date, timeZone?: string): { day: string; hour: number } {
  if (!timeZone) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return {
      day: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      hour: date.getHours(),
    };
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return {
    day: `${part('year')}-${part('month')}-${part('day')}`,
    hour: Number(part('hour')) % 24,
  };
}

/**
 * Пора ли снять с линии сессию, начатую в `since`: после её начала наступил
 * вечерний час (начали до 21:00, сейчас 21:00 или позже) — «evening»; или
 * начали в другой день — «evening», если начали до 21:00, иначе «midnight»
 * (исполнитель сам включился поздно — линия работает до полуночи). null —
 * линия продолжается.
 */
export function lineAutoOffReason(
  since: Date,
  now: Date,
  timeZone?: string,
  cutoffHour: number = LINE_EVENING_OFF_HOUR,
): LineAutoOffReason | null {
  if (now.getTime() <= since.getTime()) return null;
  const start = localDayHour(since, timeZone);
  const current = localDayHour(now, timeZone);
  if (start.day !== current.day) return start.hour < cutoffHour ? 'evening' : 'midnight';
  return start.hour < cutoffHour && current.hour >= cutoffHour ? 'evening' : null;
}

/** «21:00». */
export function eveningOffTime(cutoffHour: number = LINE_EVENING_OFF_HOUR): string {
  return `${String(cutoffHour).padStart(2, '0')}:00`;
}

/** Когда выключится идущая линия: утренняя — в 21:00, включённая позже — в полночь. */
export function lineOffAtText(since: Date | null, timeZone?: string): string {
  return since && localDayHour(since, timeZone).hour >= LINE_EVENING_OFF_HOUR
    ? 'В полночь линия выключится сама.'
    : `В ${eveningOffTime()} линия выключится сама.`;
}

/** Начало сегодняшнего дня по времени телефона (мс). */
export function startOfLocalDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/**
 * Линия выключилась сама: почему и в какой день (по времени телефона) —
 * хранится до тех пор, пока исполнитель не закроет сообщение в ленте или
 * снова не выйдет на линию; текст строится при показе (lineAutoOffMessage),
 * чтобы «завтра» и «вчера» были верными и через день.
 */
export interface LineAutoOff {
  reason: LineAutoOffReason;
  /** День, когда линия выключилась («2026-10-17»): вечер — день начала, полночь — следующий. */
  day: string;
}

/** Сессию `since` пора снять в `now` — что записать для ленты; null — линия идёт. */
export function lineAutoOff(since: Date, now: Date): LineAutoOff | null {
  const reason = lineAutoOffReason(since, now);
  if (!reason) return null;
  const offDay =
    reason === 'evening'
      ? since
      : new Date(since.getFullYear(), since.getMonth(), since.getDate() + 1);
  return { reason, day: localDayHour(offDay).day };
}

export function parseLineAutoOff(raw: string | null | undefined): LineAutoOff | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LineAutoOff> | null;
    if (value?.reason !== 'evening' && value?.reason !== 'midnight') return null;
    return typeof value.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.day)
      ? { reason: value.reason, day: value.day }
      : null;
  } catch {
    return null;
  }
}

/**
 * Сообщение в ленте после автоматического выключения — по сегодняшнему
 * дню: в тот же вечер «Завтра утром включите снова», на следующий день
 * «Вчера в 21:00…», позже — без дня.
 */
export function lineAutoOffMessage(off: LineAutoOff, now: Date = new Date()): string {
  const today = localDayHour(now).day;
  const yesterday = localDayHour(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
  ).day;
  const time = eveningOffTime();
  if (off.reason === 'midnight') {
    if (off.day === today && now.getHours() < LINE_MORNING_HOUR) {
      return 'Линия выключилась в полночь. Утром включите снова.';
    }
    return 'Ночью линия выключилась сама. Включите снова, если сегодня работаете.';
  }
  if (off.day === today) return `Линия выключилась в ${time}. Завтра утром включите снова.`;
  if (off.day === yesterday) {
    return `Вчера в ${time} линия выключилась сама. Включите снова, если сегодня работаете.`;
  }
  return `Линия выключилась сама в ${time}. Включите снова, если сегодня работаете.`;
}

/** До этого часа ночь ещё не утро: «Утром включите снова». */
export const LINE_MORNING_HOUR = 5;

/** Часовой пояс телефона (IANA) для сервера; undefined, если движок его не знает. */
export function deviceTimeZone(): string | undefined {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone.length > 0 && zone.length <= 64 ? zone : undefined;
  } catch {
    return undefined;
  }
}
