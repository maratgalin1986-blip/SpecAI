// «Сайты под ключ» как бизнес (S6): цены клиента, оплата и выручка. Онлайн-оплаты нет —
// клиент платит по счёту /oplata/<token>, владелец отмечает оплату вручную на
// /admin/office/clients. Сайты при просрочке не отключаются (решение владельца). Всё здесь —
// чистые функции; маршрут и страницы только читают и пишут строки Prospect.

import { siteYearlyPrice, sitePackages, type SitePackage } from '@/lib/prices';
import { quotedName } from './quotedName';

/** Базовые цены (настройки офиса, lib/office/prices.ts → officePrices), ₽. */
export interface BillingDefaults {
  setup: number;
  monthly: number;
  /** Поддержка за 12 месяцев (К12); без неё год — 12 × месяц. */
  yearly?: number;
}

/** Поля оплаты кандидата (Prospect). */
export interface BillingProspect {
  setupPrice: number | null;
  monthlyPrice: number | null;
  setupPaidAt: Date | null;
  paidUntil: Date | null;
}

/**
 * unpaid — поддержка ещё не оплачивалась; active — оплачено с запасом; expiring — до конца
 * оплаты ≤ 7 дней; overdue — оплаченный срок прошёл.
 */
export type BillingStatus = 'unpaid' | 'active' | 'expiring' | 'overdue';

export const BILLING_STATUS_TITLES: Record<BillingStatus, string> = {
  unpaid: 'не оплачен',
  active: 'оплачен',
  expiring: 'истекает',
  overdue: 'просрочен',
};

/** «Истекает» — за столько дней до конца оплаты. */
export const EXPIRING_DAYS = 7;

/** Цена клиента, которую владелец может задать вручную: целое 0…1 000 000 ₽. */
export const CLIENT_PRICE_MAX = 1_000_000;

/**
 * Кнопки оплаты на /admin/office/clients; year — оплачена поддержка на год (продление на 12
 * месяцев по годовой цене, К12); prices — только сохранить цены клиента.
 */
export const PAYMENT_ACTIONS = ['setup', 'month', 'year', 'undo', 'prices'] as const;
export type PaymentAction = (typeof PAYMENT_ACTIONS)[number];

/** Статусы, при которых сайт клиента можно оплачивать (договорились или опубликован). */
export const BILLABLE_STATUSES: readonly string[] = ['AGREED', 'PUBLISHED'];

const DAY_MS = 86_400_000;
/** Москва без перевода часов: смещение +03:00 точное (REVIEW § 5 — даты по Москве). */
const MSK_OFFSET_MS = 3 * 3_600_000;

function validPrice(value: number | null | undefined): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= CLIENT_PRICE_MAX
  );
}

/** Цены клиента: свои (заданы владельцем) или базовые. 0 — допустимая цена («бесплатно»). */
export function clientPrices(
  p: Pick<BillingProspect, 'setupPrice' | 'monthlyPrice'>,
  defaults: BillingDefaults,
): { setup: number; monthly: number } {
  return {
    setup: validPrice(p.setupPrice) ? p.setupPrice : defaults.setup,
    monthly: validPrice(p.monthlyPrice) ? p.monthlyPrice : defaults.monthly,
  };
}

/**
 * Поддержка клиента за 12 месяцев одним счётом, ₽ (К12): годовая цена пакета при его цене
 * месяца, при своей цене месяца — с той же скидкой (siteYearlyPrice).
 */
export function clientYearly(
  p: Pick<BillingProspect, 'setupPrice' | 'monthlyPrice'>,
  pkg: BillingDefaults,
): number {
  const monthly = clientPrices(p, pkg).monthly;
  return siteYearlyPrice(monthly, { monthly: pkg.monthly, yearly: pkg.yearly });
}

/**
 * Пакет клиента из sitePackages: со своим доменом — «Сайт на своём домене», иначе
 * «Сайт-визитка». Его цены — база для clientPrices на счёте и в списке клиентов.
 */
export function clientPackage(p: { domain: string | null }, base: BillingDefaults): SitePackage {
  const packages = sitePackages(base);
  const key = p.domain ? 'domen' : 'vizitka';
  const found = packages.find((pkg) => pkg.key === key) ?? packages[0];
  if (!found) throw new Error('sitePackages вернул пустой список');
  return found;
}

/**
 * Продление оплаты на `months` календарных месяцев от более поздней из дат: конец текущей
 * оплаты или сейчас (просроченный срок не «съедает» оплаченные месяцы). Месяцы считаются по
 * московскому календарю; 31-е число переходит на последний день короткого месяца.
 */
export function extendPaidUntil(current: Date | null, now: Date, months: number): Date {
  const from = current && current.getTime() > now.getTime() ? current : now;
  const msk = new Date(from.getTime() + MSK_OFFSET_MS);
  const year = msk.getUTCFullYear();
  const month = msk.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(msk.getUTCDate(), lastDay);
  const shifted = Date.UTC(
    year,
    month,
    day,
    msk.getUTCHours(),
    msk.getUTCMinutes(),
    msk.getUTCSeconds(),
    msk.getUTCMilliseconds(),
  );
  return new Date(shifted - MSK_OFFSET_MS);
}

/** Статус оплаты поддержки по `paidUntil`. Без даты — «не оплачен». */
export function billingStatus(p: Pick<BillingProspect, 'paidUntil'>, now: Date): BillingStatus {
  if (!p.paidUntil) return 'unpaid';
  const left = p.paidUntil.getTime() - now.getTime();
  if (left <= 0) return 'overdue';
  if (left <= EXPIRING_DAYS * DAY_MS) return 'expiring';
  return 'active';
}

/** Выручка в месяц (MRR), ₽: сумма поддержки у клиентов с действующей оплатой. */
export function monthlyRevenue(
  clients: readonly BillingProspect[],
  defaults: BillingDefaults,
  now: Date,
): number {
  let total = 0;
  for (const client of clients) {
    const status = billingStatus(client, now);
    if (status === 'active' || status === 'expiring') {
      total += clientPrices(client, defaults).monthly;
    }
  }
  return total;
}

export interface BillingSummary {
  /** Всего клиентов в списке. */
  clients: number;
  /** Оплатили сайт (разовая оплата отмечена). */
  paid: number;
  /** Выручка в месяц, ₽. */
  revenue: number;
  /** Истекает за 7 дней. */
  expiring: number;
  /** Просрочено. */
  overdue: number;
}

/** Плитки над списком клиентов. */
export function billingSummary(
  clients: readonly BillingProspect[],
  defaults: BillingDefaults,
  now: Date,
): BillingSummary {
  let paid = 0;
  let expiring = 0;
  let overdue = 0;
  for (const client of clients) {
    if (client.setupPaidAt) paid += 1;
    const status = billingStatus(client, now);
    if (status === 'expiring') expiring += 1;
    if (status === 'overdue') overdue += 1;
  }
  return {
    clients: clients.length,
    paid,
    revenue: monthlyRevenue(clients, defaults, now),
    expiring,
    overdue,
  };
}

const URGENCY: Record<BillingStatus, number> = { overdue: 0, expiring: 1, unpaid: 2, active: 3 };

/**
 * Порядок списка клиентов: сначала просроченные, затем истекающие, неоплаченные и оплаченные;
 * внутри группы — исходный порядок (новые публикации первыми). Исходный массив не меняется.
 */
export function byBillingUrgency<T extends Pick<BillingProspect, 'paidUntil'>>(
  clients: readonly T[],
  now: Date,
): T[] {
  return clients
    .map((client, index) => ({ client, index, rank: URGENCY[billingStatus(client, now)] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((row) => row.client);
}

/**
 * Что записать в строку Prospect по кнопке оплаты: setup — сайт оплачен сейчас (и поддержка на
 * месяц, если срока ещё нет); month / year — продление на 1 / 12 месяцев; undo — снять обе
 * отметки; prices — ничего (только цены, их пишет маршрут).
 */
export function paymentUpdate(
  p: Pick<BillingProspect, 'paidUntil'>,
  action: PaymentAction,
  now: Date,
): { setupPaidAt?: Date | null; paidUntil?: Date | null } {
  switch (action) {
    case 'setup':
      return {
        setupPaidAt: now,
        ...(p.paidUntil ? {} : { paidUntil: extendPaidUntil(null, now, 1) }),
      };
    case 'month':
      return { paidUntil: extendPaidUntil(p.paidUntil, now, 1) };
    case 'year':
      return { paidUntil: extendPaidUntil(p.paidUntil, now, 12) };
    case 'undo':
      return { setupPaidAt: null, paidUntil: null };
    case 'prices':
      return {};
  }
}

/** Что клиенту платить сейчас (страница счёта). */
export interface InvoiceDue {
  /** Сумма, ₽. */
  amount: number;
  /** За что — одна строка для счёта. */
  title: string;
}

/**
 * К оплате сейчас — по тем же правилам, что кнопки оплаты (paymentUpdate): сайт не оплачен —
 * разовая цена (первый месяц поддержки входит: «Сайт оплачен» открывает месяц); сайт оплачен,
 * а срок поддержки кончился, кончается за 7 дней или ещё не начат — месяц поддержки; оплачено
 * с запасом или цена 0 — ничего (null).
 */
export function invoiceDue(
  p: BillingProspect,
  prices: { setup: number; monthly: number },
  now: Date,
): InvoiceDue | null {
  if (!p.setupPaidAt) {
    return prices.setup > 0
      ? { amount: prices.setup, title: 'Сайт — разово, первый месяц работы и поддержки входит' }
      : null;
  }
  if (billingStatus(p, now) === 'active' || prices.monthly <= 0) return null;
  return { amount: prices.monthly, title: 'Работа сайта и поддержка — следующий месяц' };
}

/** Строка Prospect, из которой строится счёт. */
export interface InvoiceRow extends BillingProspect {
  kind: string;
  status: string;
  name: string;
  city: string | null;
  slug: string;
  token: string;
  domain: string | null;
}

/**
 * Всё, что видит клиент на /oplata/<token>, — и только это: без id, телефона и почты
 * кандидата, заметок и дат работы офиса (REVIEW § 2, страницы по секретному токену).
 */
export interface InvoiceView {
  company: string;
  /** «Счёт за сайт для компании «Стоматология Улыбка»» — заголовок страницы. */
  heading: string;
  /** «Сайт для компании «…»» — назначение платежа. */
  paymentPurpose: string;
  city: string | null;
  packageTitle: string;
  includes: readonly string[];
  setup: number;
  monthly: number;
  /** Поддержка сразу за 12 месяцев, ₽ (годовая цена, К12). */
  yearly: number;
  /** «09.11.2026» — когда отмечена оплата сайта, иначе null. */
  setupPaidOn: string | null;
  /** «09.12.2026» — до какого дня оплачена поддержка, иначе null. */
  paidUntil: string | null;
  due: InvoiceDue | null;
  /** Опубликованный сайт (свой домен или /s/<slug>) или превью, пока сайт не опубликован. */
  siteHref: string;
  sitePublished: boolean;
  /** Реквизиты владельца; null — «пришлём в ответ на письмо». */
  payDetails: string | null;
}

/** Счёт для клиента; null — счёта нет (не сайт или статус не AGREED / PUBLISHED). */
export function buildInvoice(
  row: InvoiceRow,
  base: BillingDefaults,
  ctx: { payDetails: string | null | undefined; baseUrl: string },
  now: Date,
): InvoiceView | null {
  if (row.kind !== 'site' || !BILLABLE_STATUSES.includes(row.status)) return null;
  const pkg = clientPackage(row, base);
  const prices = clientPrices(row, pkg);
  const root = ctx.baseUrl.replace(/\/+$/, '');
  const published = row.status === 'PUBLISHED';
  const siteHref = published
    ? row.domain
      ? `https://${row.domain}/`
      : `${root}/s/${encodeURIComponent(row.slug)}`
    : `${root}/preview/${encodeURIComponent(row.token)}`;
  const payDetails = ctx.payDetails?.trim();
  return {
    company: row.name,
    heading: `Счёт за сайт для компании ${quotedName(row.name)}`,
    paymentPurpose: `Сайт для компании ${quotedName(row.name)}`,
    city: row.city,
    packageTitle: pkg.title,
    includes: pkg.includes,
    setup: prices.setup,
    monthly: prices.monthly,
    yearly: clientYearly(row, pkg),
    setupPaidOn: row.setupPaidAt ? formatDayMsk(row.setupPaidAt) : null,
    paidUntil: row.paidUntil ? formatDayMsk(row.paidUntil) : null,
    due: invoiceDue(row, prices, now),
    siteHref,
    sitePublished: published,
    payDetails: payDetails || null,
  };
}

/** Одна площадка в инструкции «ссылка на сайт в карточке» (К16). */
export interface MapLinkGuideSection {
  title: string;
  steps: readonly string[];
}

/**
 * Инструкция «Как поставить ссылку на сайт в карточку Яндекс Карт и 2ГИС» (К16): шаги текстом
 * для клиента (страница счёта после оплаты) и для владельца (/admin/office/clients). Ссылку в
 * карточку может поставить только её владелец; без неё посетителей у сайта почти не будет.
 */
export function mapLinkGuide(siteHref: string): MapLinkGuideSection[] {
  return [
    {
      title: 'Яндекс Карты',
      steps: [
        'Откройте yandex.ru/sprav (Яндекс Бизнес) и войдите под той учётной записью Яндекса, к которой привязана карточка компании.',
        'Если карточки в списке нет — найдите компанию через «Добавить организацию» и подтвердите, что вы её владелец (звонок или письмо на контакты из карточки).',
        'Выберите компанию и откройте данные об организации, раздел с контактами.',
        `В поле «Сайт» вставьте адрес: ${siteHref}`,
        'Сохраните. Яндекс проверяет изменения, обычно это занимает от нескольких часов до нескольких дней.',
      ],
    },
    {
      title: '2ГИС',
      steps: [
        'Откройте account.2gis.com («2ГИС для бизнеса») и войдите или зарегистрируйтесь по телефону компании.',
        'Найдите свою компанию и подтвердите, что вы её владелец, — 2ГИС подскажет, как.',
        `В контактах компании добавьте сайт: ${siteHref}`,
        'Сохраните. 2ГИС проверяет изменения, обычно несколько дней.',
        'Нет доступа к карточке — в самой карточке в 2ГИС нажмите «Исправить информацию» и предложите адрес сайта.',
      ],
    },
  ];
}

/** «09.12.2026» по Москве — одинаково на сервере и в браузере, без данных локали. */
export function formatDayMsk(date: Date): string {
  const msk = new Date(date.getTime() + MSK_OFFSET_MS);
  const dd = String(msk.getUTCDate()).padStart(2, '0');
  const mm = String(msk.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${msk.getUTCFullYear()}`;
}
