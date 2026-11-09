// Офис агентов: цены сайта под ключ. Владелец задаёт их в /admin/office (AppSetting
// office.sitePrice / office.siteMonthly / office.siteYearly); пока не задал — SITE_PRICES из
// lib/prices.ts (3 900 ₽ разово, 990 ₽ в месяц, 9 900 ₽ за год — К12).

import { prisma } from '@specai/database';
import { SITE_PRICES } from '@/lib/prices';
import { OFFICE_SETTINGS } from './plan';

/** Ключ AppSetting годовой цены поддержки (К12); рядом с office.sitePrice / office.siteMonthly. */
export const SITE_YEARLY_SETTING = 'office.siteYearly';

export interface OfficePrices {
  /** Разовая цена сайта, ₽. */
  setup: number;
  /** Поддержка в месяц, ₽. */
  monthly: number;
  /** Поддержка сразу за 12 месяцев, ₽; не дороже 12 × monthly. */
  yearly: number;
}

function positiveInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim().replace(/\s+/g, '');
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Чистый разбор строк AppSetting: целые > 0, иначе значение по умолчанию. Год без своей
 * настройки: при базовой цене месяца — SITE_PRICES.yearly, при своей — 12 × месяц (скидку
 * за год владелец задаёт сам). Год дороже 12 месяцев не бывает.
 */
export function parseOfficePrices(rows: readonly { key: string; value: string }[]): OfficePrices {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const setup = positiveInt(byKey.get(OFFICE_SETTINGS.sitePrice)) ?? SITE_PRICES.setup;
  const monthly = positiveInt(byKey.get(OFFICE_SETTINGS.siteMonthly)) ?? SITE_PRICES.monthly;
  const yearlySetting = positiveInt(byKey.get(SITE_YEARLY_SETTING));
  const yearlyDefault = monthly === SITE_PRICES.monthly ? SITE_PRICES.yearly : monthly * 12;
  const yearly = Math.min(yearlySetting ?? yearlyDefault, monthly * 12);
  return { setup, monthly, yearly };
}

export async function officePrices(): Promise<OfficePrices> {
  const rows = await prisma.appSetting.findMany({
    where: {
      key: { in: [OFFICE_SETTINGS.sitePrice, OFFICE_SETTINGS.siteMonthly, SITE_YEARLY_SETTING] },
    },
    select: { key: true, value: true },
  });
  return parseOfficePrices(rows);
}
