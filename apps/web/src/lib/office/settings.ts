// Офис агентов: настройки из AppSetting одним запросом (spec §1, §12). Ключи плана и цен —
// OFFICE_SETTINGS в plan.ts; сюда добавлены только ключи, которых там нет.

import { prisma } from '@specai/database';
import { SITE } from '@/lib/site';
import { OFFICE_SETTINGS, defaultPlan, formatPlan } from './plan';

export const OFFICE_EXTRA_SETTINGS = {
  /** «1» — WhatsApp можно слать на обычный мобильный из карточки, не только на contact:whatsapp. */
  whatsappToPhone: 'office.whatsappToPhone',
  /** Реквизиты для оплаты сайта (свободный текст) — на странице счёта /oplata/<token> (S6). */
  payDetails: 'office.payDetails',
  /** «1» — ИИ-аналитик переписывает вступление и пункты персонального предложения (U2). */
  aiOffers: 'office.aiOffers',
  /** Сколько предложений в московские сутки ИИ может переписать (целое 0…500). */
  aiDailyCap: 'office.aiDailyCap',
  /**
   * Как уходят письма офиса (К2): 'approve' (по умолчанию) — крон только готовит «письма дня»,
   * уходят они по кнопке владельца на /admin/office/pisma; 'auto' — крон отправляет сам.
   */
  outreachMode: 'office.outreachMode',
} as const;

/** Режим рассылки: с утверждением владельцем или сама по крону. */
export type OutreachMode = 'approve' | 'auto';
export const OUTREACH_MODES: readonly OutreachMode[] = ['approve', 'auto'];

/** Режим из строки настройки: всё, кроме «auto», — утверждение владельцем. */
export function parseOutreachMode(value: string | undefined): OutreachMode {
  return value?.trim() === 'auto' ? 'auto' : 'approve';
}

/** Лимит ИИ-предложений в сутки, если владелец не задал свой. */
export const DEFAULT_AI_DAILY_CAP = 30;
/** Больше этого ИИ-предложений в сутки не бывает. */
export const AI_DAILY_CAP_MAX = 500;

/** Реквизиты для оплаты — не длиннее, знаков. */
export const PAY_DETAILS_MAX = 2000;

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
  /** Реквизиты для оплаты сайта; пусто — на счёте «пришлём в ответ на письмо». */
  payDetails: string;
  /** ИИ-аналитик включён (по умолчанию выключен). */
  aiOffers: boolean;
  /** ИИ-предложений в сутки, 0…AI_DAILY_CAP_MAX. */
  aiDailyCap: number;
  /** Режим рассылки (К2), по умолчанию 'approve'. */
  outreachMode: OutreachMode;
}

function flag(value: string | undefined): boolean {
  return value?.trim() === '1';
}

/** Флажок со значением по умолчанию, пока владелец его не сохранял («1» / «0» в базе). */
function flagOr(value: string | undefined, fallback: boolean): boolean {
  return value === undefined || value.trim() === '' ? fallback : flag(value);
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
    // Владелец, 2026-11-09: «если в карте оставили номера для связи — значит, нужно связаться».
    // Поэтому мобильный из карточки по умолчанию годится для WhatsApp; флажок в админке это
    // выключает. Каждое сообщение всё равно уходит только после «Отправить» владельца.
    whatsappToPhone: flagOr(byKey.get(OFFICE_EXTRA_SETTINGS.whatsappToPhone), true),
    payDetails: (byKey.get(OFFICE_EXTRA_SETTINGS.payDetails) ?? '')
      .trim()
      .slice(0, PAY_DETAILS_MAX),
    aiOffers: flag(byKey.get(OFFICE_EXTRA_SETTINGS.aiOffers)),
    aiDailyCap: Math.min(
      AI_DAILY_CAP_MAX,
      int(byKey.get(OFFICE_EXTRA_SETTINGS.aiDailyCap), DEFAULT_AI_DAILY_CAP),
    ),
    outreachMode: parseOutreachMode(byKey.get(OFFICE_EXTRA_SETTINGS.outreachMode)),
  };
}

export async function readOfficeSettings(): Promise<OfficeSettings> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [...OFFICE_SETTING_KEYS] } },
    select: { key: true, value: true },
  });
  return parseOfficeSettings(rows);
}
