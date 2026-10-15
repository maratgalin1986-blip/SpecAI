import type { LiveMachine } from './api';

/**
 * Что уходит в карту (window.setLive в providersMapHtml): короткая метка на
 * значке — первое слово названия машины или категории, подпись-пузырь с
 * сервера, и признак парка СпецПласт16 (цвет бренда).
 */
export interface LivePin {
  equipmentId: string | null;
  lat: number;
  lon: number;
  short: string;
  bubble: string;
  house: boolean;
}

export function shortLabel(machine: Pick<LiveMachine, 'equipment' | 'company'>): string {
  const source = machine.equipment?.category ?? machine.equipment?.name ?? machine.company.name;
  const word = source.split(/[\s,(]/).find((part) => part.length > 0) ?? '•';
  return word.length > 6 ? `${word.slice(0, 5)}.` : word;
}

export function toLivePins(machines: LiveMachine[]): LivePin[] {
  return machines.map((machine) => ({
    equipmentId: machine.equipment?.id ?? null,
    lat: machine.lat,
    lon: machine.lon,
    short: shortLabel(machine),
    bubble: machine.bubble,
    house: machine.company.isHouse,
  }));
}

/** Как часто карта заказчика перечитывает технику на линии. */
export const LIVE_REFRESH_MS = 30_000;
/** Как часто телефон исполнителя на линии отправляет своё положение. */
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
