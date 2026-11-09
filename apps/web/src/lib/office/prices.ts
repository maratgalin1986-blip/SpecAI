// Офис агентов: цены сайта под ключ. Владелец задаёт их в /admin/office (AppSetting
// office.sitePrice / office.siteMonthly); пока не задал — SITE_PRICES из lib/prices.ts.

import { prisma } from '@specai/database';
import { SITE_PRICES } from '@/lib/prices';
import { OFFICE_SETTINGS } from './plan';

export interface OfficePrices {
  /** Разовая цена сайта, ₽. */
  setup: number;
  /** Поддержка в месяц, ₽. */
  monthly: number;
}

function positiveInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim().replace(/\s+/g, '');
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Чистый разбор строк AppSetting: целые > 0, иначе значение по умолчанию. */
export function parseOfficePrices(rows: readonly { key: string; value: string }[]): OfficePrices {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    setup: positiveInt(byKey.get(OFFICE_SETTINGS.sitePrice)) ?? SITE_PRICES.setup,
    monthly: positiveInt(byKey.get(OFFICE_SETTINGS.siteMonthly)) ?? SITE_PRICES.monthly,
  };
}

export async function officePrices(): Promise<OfficePrices> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [OFFICE_SETTINGS.sitePrice, OFFICE_SETTINGS.siteMonthly] } },
    select: { key: true, value: true },
  });
  return parseOfficePrices(rows);
}
