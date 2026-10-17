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
