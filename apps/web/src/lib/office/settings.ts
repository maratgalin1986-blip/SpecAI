// Офис агентов: настройки из AppSetting одним запросом (spec §1, §12). Ключи плана и цен —
// OFFICE_SETTINGS в plan.ts; сюда добавлены только ключи, которых там нет.

import { prisma } from '@specai/database';
import { SITE } from '@/lib/site';
import { OFFICE_SETTINGS, defaultPlan, formatPlan } from './plan';

export const OFFICE_EXTRA_SETTINGS = {
  /** «1» — WhatsApp можно слать на обычный мобильный из карточки, не только на contact:whatsapp. */
  whatsappToPhone: 'office.whatsappToPhone',
} as const;

export const OFFICE_SETTING_KEYS: readonly string[] = [
  ...Object.values(OFFICE_SETTINGS),
  ...Object.values(OFFICE_EXTRA_SETTINGS),
];

/** Дневной лимит отправок на канал, если владелец не задал свой. */
export const DEFAULT_DAILY_CAP = 20;

export interface OfficeSettings {
  /** Текст плана «агент; ниша; город» построчно (по умолчанию — defaultPlan()). */
  plan: string;
  /** Номер следующего шага плана. */
  cursor: number;
  /** Поиск на паузе. */
  paused: boolean;
  /** Рассылка на паузе. */
  outreachPaused: boolean;
  /** Писем / сообщений WhatsApp в день, на канал. */
  dailyCap: number;
  /** Адрес для ответов на письма кандидатам. */
  replyTo: string;
  /** WhatsApp на обычный мобильный из карточки. */
  whatsappToPhone: boolean;
}

function flag(value: string | undefined): boolean {
  return value?.trim() === '1';
}

function int(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}

/** Чистый разбор строк AppSetting. */
export function parseOfficeSettings(
  rows: readonly { key: string; value: string }[],
): OfficeSettings {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const plan = byKey.get(OFFICE_SETTINGS.plan);
  const replyTo = byKey.get(OFFICE_SETTINGS.replyTo)?.trim();
  return {
    plan: plan && plan.trim() ? plan : formatPlan(defaultPlan()),
    cursor: int(byKey.get(OFFICE_SETTINGS.cursor), 0),
    paused: flag(byKey.get(OFFICE_SETTINGS.paused)),
    outreachPaused: flag(byKey.get(OFFICE_SETTINGS.outreachPaused)),
    dailyCap: int(byKey.get(OFFICE_SETTINGS.dailyCap), DEFAULT_DAILY_CAP),
    replyTo: replyTo || SITE.email,
    whatsappToPhone: flag(byKey.get(OFFICE_EXTRA_SETTINGS.whatsappToPhone)),
  };
}

export async function readOfficeSettings(): Promise<OfficeSettings> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [...OFFICE_SETTING_KEYS] } },
    select: { key: true, value: true },
  });
  return parseOfficeSettings(rows);
}
