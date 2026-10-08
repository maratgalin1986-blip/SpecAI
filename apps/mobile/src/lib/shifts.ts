import type { BadgeTone } from '@/components/ui';
import type { CalendarDayKind, Shift, ShiftStatus, TimesheetState } from './api';

/**
 * Чистые помощники экранов смены, табеля и календаря (без сети): подписи
 * статусов, цвета, таймер, сетка месяца. Правила переходов проверяет сервер
 * (packages/shared/src/schemas/shift.ts), здесь только представление.
 */

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  PLANNED: 'Смена не начата',
  EN_ROUTE: 'Выехал',
  ON_SITE: 'На объекте',
  WORKING: 'Работа',
  IDLE: 'Простой',
  FINISHED: 'Смена завершена',
};

/** Подпись кнопки перехода в статус. */
export const SHIFT_ACTION_LABELS: Record<ShiftStatus, string> = {
  PLANNED: 'Смена не начата',
  EN_ROUTE: 'Выехал',
  ON_SITE: 'На объекте',
  WORKING: 'Начать работу',
  IDLE: 'Простой',
  FINISHED: 'Завершить смену',
};

export const SHIFT_STATUS_TONES: Record<ShiftStatus, BadgeTone> = {
  PLANNED: 'neutral',
  EN_ROUTE: 'info',
  ON_SITE: 'info',
  WORKING: 'success',
  IDLE: 'warning',
  FINISHED: 'dark',
};

export function shiftTone(status: string): BadgeTone {
  return (SHIFT_STATUS_TONES as Record<string, BadgeTone>)[status] ?? 'neutral';
}

/** Переход, который просит фото: первый выезд/прибытие и завершение смены. */
export function transitionWantsPhoto(
  shift: Pick<Shift, 'status' | 'startPhotoUrl'>,
  next: ShiftStatus,
) {
  if (next === 'FINISHED') return true;
  return shift.status === 'PLANNED' && !shift.startPhotoUrl;
}

export const TIMESHEET_STATE_LABELS: Record<TimesheetState, string> = {
  none: 'Табель не заполнен',
  waiting: 'Ждёт подтверждения',
  disputed: 'Есть замечания',
  final: 'Подтверждён обеими сторонами',
};

export const TIMESHEET_STATE_TONES: Record<TimesheetState, BadgeTone> = {
  none: 'neutral',
  waiting: 'warning',
  disputed: 'danger',
  final: 'success',
};

/** «7 ч 30 мин» из минут. */
export function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/**
 * Таймер на экране: сервер отдаёт минуты на момент ответа, а пока смена в
 * «Работе» или «Простое», к ним прибавляется время с момента загрузки.
 */
export function liveMinutes(
  shift: Pick<Shift, 'status' | 'workedMinutes' | 'idleMinutes'>,
  loadedAt: number,
  now: number,
): { worked: number; idle: number } {
  const extra = Math.max(0, Math.floor((now - loadedAt) / 60_000));
  return {
    worked: shift.workedMinutes + (shift.status === 'WORKING' ? extra : 0),
    idle: shift.idleMinutes + (shift.status === 'IDLE' ? extra : 0),
  };
}

/** Часы с шагом четверть часа: 460 мин → 7.75. */
export function suggestedHours(minutes: number): number {
  return Math.round((minutes / 60) * 4) / 4;
}

/** «12:05» по местному времени телефона. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** «08.10» из «2026-10-08». */
export function shortDay(key: string): string {
  const [, month, day] = key.split('-');
  return month && day ? `${day}.${month}` : key;
}

export const CALENDAR_KIND_LABELS: Record<CalendarDayKind, string> = {
  free: 'Свободна',
  booked: 'Занята',
  pending: 'Ждёт подтверждения',
  blocked: 'Не сдаётся',
  maintenance: 'На ремонте',
};

export const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const;

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/** Сколько пустых клеток перед 1-м числом (неделя с понедельника). */
export function leadingBlanks(year: number, month: number): number {
  return (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
}

/** YYYY-MM-DD в локальной зоне телефона. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
