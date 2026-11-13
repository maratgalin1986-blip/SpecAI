// Офис агентов: настройки из AppSetting одним запросом (spec §1, §12). Ключи плана и цен —
// OFFICE_SETTINGS в plan.ts; сюда добавлены только ключи, которых там нет.

import { prisma } from '@specai/database';
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
   * Как уходят письма офиса (К2): 'auto' (по умолчанию с 2026-11-11, решение владельца) — офис
   * сам отправляет первые письма днём по Москве; 'approve' — крон только готовит «письма дня»,
   * уходят они по кнопке владельца на /admin/office/pisma.
   */
  outreachMode: 'office.outreachMode',
  /** Ставка НДС в счёте-оферте, % (К8): 0 — «НДС не облагается»; по умолчанию DEFAULT_VAT_RATE. */
  vatRate: 'office.vatRate',
  /**
   * «1» — режим «сам по расписанию» отправляет и WhatsApp через шлюз (Green API). По умолчанию
   * нет и в админке переключателя нет: шлюза у офиса нет, сообщения WhatsApp отправляет владелец.
   */
  whatsappAuto: 'office.whatsappAuto',
} as const;

/** Режим рассылки: с утверждением владельцем или сама по крону. */
export type OutreachMode = 'approve' | 'auto';
export const OUTREACH_MODES: readonly OutreachMode[] = ['approve', 'auto'];

/**
 * Режим, пока владелец не выбрал свой на странице «Письма дня». Владелец, 2026-11-11: «Начинай
 * отправку сам уже» (до этого по умолчанию было 'approve' — каждое письмо дня по его кнопке).
 * Риск записан в docs/owner-requests.md: закон «О рекламе» (ч. 2 ст. 18) запрещает рассылку
 * без участия человека; решение и ответственность — владельца, вернуть 'approve' — одна кнопка.
 */
export const DEFAULT_OUTREACH_MODE: OutreachMode = 'auto';

/**
 * Режим из строки настройки: пусто — по умолчанию; «auto» и «approve» — как выбрал владелец;
 * любое другое значение — утверждение владельцем (непонятное не должно отправлять само).
 */
export function parseOutreachMode(value: string | undefined): OutreachMode {
  const text = value?.trim() ?? '';
  if (text === '') return DEFAULT_OUTREACH_MODE;
  return text === 'auto' ? 'auto' : 'approve';
}

/** Лимит ИИ-предложений в сутки, если владелец не задал свой. */
export const DEFAULT_AI_DAILY_CAP = 30;
/** Больше этого ИИ-предложений в сутки не бывает. */
export const AI_DAILY_CAP_MAX = 500;

/** Реквизиты для оплаты — не длиннее, знаков. */
export const PAY_DETAILS_MAX = 2000;

/**
 * Ставки НДС, которые можно выбрать для счёта: 0 — «НДС не облагается» (УСН без НДС), 5 и 7 —
 * УСН с НДС, 10, 20 и 22 — общая система. Какая верна для ООО, подтверждает бухгалтер.
 */
export const VAT_RATES: readonly number[] = [0, 5, 7, 10, 20, 22];
/** ООО работает с НДС (владелец, 2026-11-02); бизнес-план считает общую систему, 22 %. */
export const DEFAULT_VAT_RATE = 22;

/** Ставка из строки настройки: только из VAT_RATES, иначе по умолчанию. */
export function parseVatRate(value: string | undefined): number {
  const rate = Number((value ?? '').trim());
  return value !== undefined && value.trim() !== '' && VAT_RATES.includes(rate)
    ? rate
    : DEFAULT_VAT_RATE;
}

export const OFFICE_SETTING_KEYS: readonly string[] = [
  ...Object.values(OFFICE_SETTINGS),
  ...Object.values(OFFICE_EXTRA_SETTINGS),
];

/** Дневной лимит отправок на канал, если владелец не задал свой (50 на проект в сутки, равномерно — владелец, 2026-11-13). */
export const DEFAULT_DAILY_CAP = 50;

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
  /**
   * Адрес для ответов на письма кандидатам (Reply-To). Пусто (по умолчанию) — заголовка нет,
   * ответы приходят в ящик, с которого ушло письмо: туда смотрит владелец и туда же придёт
   * чтение ответов. Раньше по умолчанию стоял адрес с сайта — это другой ящик.
   */
  replyTo: string;
  /** WhatsApp на обычный мобильный из карточки. */
  whatsappToPhone: boolean;
  /** Реквизиты для оплаты сайта; пусто — на счёте «пришлём в ответ на письмо». */
  payDetails: string;
  /** ИИ-аналитик включён (по умолчанию выключен). */
  aiOffers: boolean;
  /** ИИ-предложений в сутки, 0…AI_DAILY_CAP_MAX. */
  aiDailyCap: number;
  /** Режим рассылки (К2), по умолчанию DEFAULT_OUTREACH_MODE. */
  outreachMode: OutreachMode;
  /** Ставка НДС в счёте-оферте, %; 0 — без НДС. */
  vatRate: number;
  /** Режим «сам» отправляет и WhatsApp через шлюз (по умолчанию нет). */
  whatsappAuto: boolean;
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
    replyTo: replyTo ?? '',
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
    vatRate: parseVatRate(byKey.get(OFFICE_EXTRA_SETTINGS.vatRate)),
    whatsappAuto: flag(byKey.get(OFFICE_EXTRA_SETTINGS.whatsappAuto)),
  };
}

export async function readOfficeSettings(): Promise<OfficeSettings> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [...OFFICE_SETTING_KEYS] } },
    select: { key: true, value: true },
  });
  return parseOfficeSettings(rows);
}
