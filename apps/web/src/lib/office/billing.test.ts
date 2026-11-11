import { describe, expect, it } from 'vitest';
import { SITE_DOMAIN_SETUP_EXTRA, rub } from '@/lib/prices';
import {
  billingStatus,
  billingSummary,
  buildInvoice,
  byBillingUrgency,
  clientPackage,
  clientPrices,
  clientYearly,
  extendPaidUntil,
  formatDayMsk,
  invoiceDue,
  bankVatClause,
  invoiceIdentity,
  rubKop,
  vatIncluded,
  vatLine,
  mapLinkGuide,
  monthlyRevenue,
  paymentUpdate,
  type BillingProspect,
  type InvoiceRow,
} from './billing';

const DEFAULTS = { setup: 15000, monthly: 1500 };
const DAY = 86_400_000;
const NOW = new Date('2026-11-09T12:00:00Z'); // 15:00 по Москве

function client(patch: Partial<BillingProspect> = {}): BillingProspect {
  return { setupPrice: null, monthlyPrice: null, setupPaidAt: null, paidUntil: null, ...patch };
}

describe('billing: clientPrices', () => {
  it('takes the base prices when the client has none', () => {
    expect(clientPrices(client(), DEFAULTS)).toEqual({ setup: 15000, monthly: 1500 });
  });

  it("takes the client's own prices, 0 included", () => {
    expect(clientPrices(client({ setupPrice: 9000, monthlyPrice: 0 }), DEFAULTS)).toEqual({
      setup: 9000,
      monthly: 0,
    });
  });

  it('ignores a broken stored price one field at a time', () => {
    expect(clientPrices(client({ setupPrice: -1, monthlyPrice: 900 }), DEFAULTS)).toEqual({
      setup: 15000,
      monthly: 900,
    });
    expect(clientPrices(client({ setupPrice: 12.5, monthlyPrice: 2_000_000 }), DEFAULTS)).toEqual(
      DEFAULTS,
    );
  });
});

describe('billing: clientPackage', () => {
  it('is the business card without a domain and the domain package with one', () => {
    expect(clientPackage({ domain: null }, DEFAULTS).key).toBe('vizitka');
    const withDomain = clientPackage({ domain: 'ulybka-kazan.ru' }, DEFAULTS);
    expect(withDomain.key).toBe('domen');
    expect(withDomain.setup).toBe(DEFAULTS.setup + SITE_DOMAIN_SETUP_EXTRA);
    expect(clientPrices(client(), withDomain).setup).toBe(DEFAULTS.setup + SITE_DOMAIN_SETUP_EXTRA);
  });
});

describe('billing: extendPaidUntil', () => {
  it('counts from now when nothing is paid', () => {
    expect(extendPaidUntil(null, NOW, 1).toISOString()).toBe('2026-12-09T12:00:00.000Z');
    expect(extendPaidUntil(null, NOW, 12).toISOString()).toBe('2027-11-09T12:00:00.000Z');
  });

  it('counts from the end of the paid period when it is still ahead', () => {
    const current = new Date('2026-12-20T09:00:00Z');
    expect(extendPaidUntil(current, NOW, 1).toISOString()).toBe('2027-01-20T09:00:00.000Z');
  });

  it('counts from now when the paid period is over (no paying for the gap)', () => {
    const current = new Date('2026-10-01T09:00:00Z');
    expect(extendPaidUntil(current, NOW, 1).toISOString()).toBe('2026-12-09T12:00:00.000Z');
  });

  it('moves the 31st to the last day of a short month, leap years included', () => {
    const jan31 = new Date('2027-01-31T09:00:00Z');
    expect(extendPaidUntil(jan31, NOW, 1).toISOString()).toBe('2027-02-28T09:00:00.000Z');
    const jan31Leap = new Date('2028-01-31T09:00:00Z');
    expect(extendPaidUntil(jan31Leap, NOW, 1).toISOString()).toBe('2028-02-29T09:00:00.000Z');
    const aug31 = new Date('2027-08-31T09:00:00Z');
    expect(extendPaidUntil(aug31, NOW, 1).toISOString()).toBe('2027-09-30T09:00:00.000Z');
  });

  it('follows the Moscow calendar, not UTC', () => {
    // 31 января 23:30 UTC — уже 1 февраля по Москве: +1 месяц — 1 марта по Москве.
    const lateJan = new Date('2027-01-31T23:30:00Z');
    expect(extendPaidUntil(lateJan, NOW, 1).toISOString()).toBe('2027-02-28T23:30:00.000Z');
    expect(formatDayMsk(extendPaidUntil(lateJan, NOW, 1))).toBe('01.03.2027');
  });

  it('crosses the year', () => {
    const dec = new Date('2026-12-15T09:00:00Z');
    expect(extendPaidUntil(dec, NOW, 1).toISOString()).toBe('2027-01-15T09:00:00.000Z');
    expect(extendPaidUntil(dec, NOW, 12).toISOString()).toBe('2027-12-15T09:00:00.000Z');
  });
});

describe('billing: billingStatus', () => {
  it('is unpaid without a paid date', () => {
    expect(billingStatus(client(), NOW)).toBe('unpaid');
    expect(billingStatus(client({ setupPaidAt: NOW }), NOW)).toBe('unpaid');
  });

  it('is active, expiring within 7 days, overdue after the date', () => {
    expect(billingStatus(client({ paidUntil: new Date(NOW.getTime() + 8 * DAY) }), NOW)).toBe(
      'active',
    );
    expect(billingStatus(client({ paidUntil: new Date(NOW.getTime() + 7 * DAY) }), NOW)).toBe(
      'expiring',
    );
    expect(billingStatus(client({ paidUntil: new Date(NOW.getTime() + 60_000) }), NOW)).toBe(
      'expiring',
    );
    expect(billingStatus(client({ paidUntil: NOW }), NOW)).toBe('overdue');
    expect(billingStatus(client({ paidUntil: new Date(NOW.getTime() - DAY) }), NOW)).toBe(
      'overdue',
    );
  });
});

describe('billing: monthlyRevenue and billingSummary', () => {
  const clients = [
    client({ setupPaidAt: NOW, paidUntil: new Date(NOW.getTime() + 30 * DAY) }), // active, база
    client({
      setupPaidAt: NOW,
      monthlyPrice: 1000,
      paidUntil: new Date(NOW.getTime() + 3 * DAY),
    }), // expiring, своя цена
    client({ setupPaidAt: NOW, paidUntil: new Date(NOW.getTime() - DAY) }), // overdue
    client(), // unpaid
    client({ monthlyPrice: 0, paidUntil: new Date(NOW.getTime() + 30 * DAY) }), // active, бесплатно
  ];

  it('sums the monthly price of active and expiring clients only', () => {
    expect(monthlyRevenue(clients, DEFAULTS, NOW)).toBe(1500 + 1000);
    expect(monthlyRevenue([], DEFAULTS, NOW)).toBe(0);
  });

  it('counts the tiles', () => {
    expect(billingSummary(clients, DEFAULTS, NOW)).toEqual({
      clients: 5,
      paid: 3,
      revenue: 2500,
      expiring: 1,
      overdue: 1,
    });
  });
});

describe('billing: byBillingUrgency', () => {
  it('puts overdue, then expiring, then unpaid, then active, keeping the order inside', () => {
    const rows = [
      { name: 'a', paidUntil: new Date(NOW.getTime() + 30 * DAY) },
      { name: 'b', paidUntil: null },
      { name: 'c', paidUntil: new Date(NOW.getTime() - DAY) },
      { name: 'd', paidUntil: new Date(NOW.getTime() + 2 * DAY) },
      { name: 'e', paidUntil: null },
      { name: 'f', paidUntil: new Date(NOW.getTime() - 2 * DAY) },
    ];
    expect(byBillingUrgency(rows, NOW).map((r) => r.name)).toEqual(['c', 'f', 'd', 'b', 'e', 'a']);
    expect(rows[0]!.name).toBe('a');
  });
});

describe('billing: paymentUpdate', () => {
  it('setup marks the site paid and opens a month of support when there is none', () => {
    expect(paymentUpdate({ paidUntil: null }, 'setup', NOW)).toEqual({
      setupPaidAt: NOW,
      paidUntil: new Date('2026-12-09T12:00:00Z'),
    });
  });

  it('setup keeps an existing paid period', () => {
    expect(paymentUpdate({ paidUntil: new Date('2027-03-01T00:00:00Z') }, 'setup', NOW)).toEqual({
      setupPaidAt: NOW,
    });
  });

  it('month and year extend the period', () => {
    const current = new Date('2026-12-20T09:00:00Z');
    expect(paymentUpdate({ paidUntil: current }, 'month', NOW)).toEqual({
      paidUntil: new Date('2027-01-20T09:00:00Z'),
    });
    expect(paymentUpdate({ paidUntil: current }, 'year', NOW)).toEqual({
      paidUntil: new Date('2027-12-20T09:00:00Z'),
    });
  });

  it('undo clears both marks, prices changes nothing', () => {
    expect(paymentUpdate({ paidUntil: NOW }, 'undo', NOW)).toEqual({
      setupPaidAt: null,
      paidUntil: null,
    });
    expect(paymentUpdate({ paidUntil: NOW }, 'prices', NOW)).toEqual({});
  });
});

describe('billing: invoiceDue', () => {
  const prices = { setup: 15000, monthly: 1500 };

  it('asks for the setup price while the site is not paid', () => {
    expect(invoiceDue(client(), prices, NOW)).toEqual({
      amount: 15000,
      title: expect.stringContaining('разово') as unknown as string,
      kind: 'setup',
    });
  });

  it('asks for a month when the paid period ends soon, is over or never started', () => {
    for (const paidUntil of [
      new Date(NOW.getTime() + 3 * DAY),
      new Date(NOW.getTime() - DAY),
      null,
    ]) {
      expect(invoiceDue(client({ setupPaidAt: NOW, paidUntil }), prices, NOW)?.amount).toBe(1500);
    }
  });

  it('asks for nothing while paid ahead or when the price is 0', () => {
    const paidAhead = client({ setupPaidAt: NOW, paidUntil: new Date(NOW.getTime() + 20 * DAY) });
    expect(invoiceDue(paidAhead, prices, NOW)).toBeNull();
    expect(invoiceDue(client(), { setup: 0, monthly: 1500 }, NOW)).toBeNull();
    expect(invoiceDue(client({ setupPaidAt: NOW }), { setup: 15000, monthly: 0 }, NOW)).toBeNull();
  });
});

describe('billing: buildInvoice', () => {
  const TOKEN = '0123456789abcdef0123456789abcdef';
  const row = (patch: Partial<InvoiceRow> = {}): InvoiceRow & Record<string, unknown> => ({
    // Поля, которых в счёте быть не должно: id, телефон, почта, заметка.
    id: 'ckprospect123',
    phone: '+79001234567',
    email: 'owner@ulybka.ru',
    note: 'перезвонить вечером',
    kind: 'site',
    status: 'PUBLISHED',
    name: 'Стоматология «Улыбка»',
    city: 'Казань',
    slug: 'ulybka-kazan',
    token: TOKEN,
    domain: null,
    agreedAt: AGREED,
    ...client(),
    ...patch,
  });
  const ctx = {
    payDetails: '  ООО «Пример», р/с …  ',
    baseUrl: 'https://example.ru/',
    vatRate: 22,
  };
  const AGREED = new Date('2026-11-05T09:00:00Z'); // 12:00 по Москве

  it('shows the company, the package, the prices and the published site', () => {
    const view = buildInvoice(row(), DEFAULTS, ctx, NOW);
    expect(view).toMatchObject({
      company: 'Стоматология «Улыбка»',
      heading: 'Счёт за сайт для компании Стоматология «Улыбка»',
      city: 'Казань',
      packageTitle: 'Сайт-визитка',
      setup: 15000,
      monthly: 1500,
      yearly: 18000,
      setupPaidOn: null,
      paidUntil: null,
      siteHref: 'https://example.ru/s/ulybka-kazan',
      sitePublished: true,
      payDetails: 'ООО «Пример», р/с …',
    });
    expect(view?.due?.amount).toBe(15000);
  });

  it('puts a plain company name in «ёлочки» in the heading and the payment purpose', () => {
    const view = buildInvoice(row({ name: 'Дента' }), DEFAULTS, ctx, NOW);
    expect(view?.heading).toBe('Счёт за сайт для компании «Дента»');
    expect(view?.paymentPurpose).toContain('за создание сайта для компании «Дента»');
  });

  it("uses the client's domain, the domain package and the client's own prices", () => {
    const view = buildInvoice(
      row({ domain: 'ulybka-kazan.ru', monthlyPrice: 1000, setupPaidAt: NOW, paidUntil: NOW }),
      DEFAULTS,
      { payDetails: '   ', baseUrl: 'https://example.ru', vatRate: 22 },
      NOW,
    );
    expect(view).toMatchObject({
      packageTitle: 'Сайт на своём домене',
      setup: DEFAULTS.setup + SITE_DOMAIN_SETUP_EXTRA,
      monthly: 1000,
      setupPaidOn: '09.11.2026',
      paidUntil: '09.11.2026',
      siteHref: 'https://ulybka-kazan.ru/',
      payDetails: null,
    });
    expect(view?.due?.amount).toBe(1000);
  });

  it('links an agreed, not yet published site to its preview', () => {
    const view = buildInvoice(row({ status: 'AGREED' }), DEFAULTS, ctx, NOW);
    expect(view?.siteHref).toBe(`https://example.ru/preview/${TOKEN}`);
    expect(view?.sitePublished).toBe(false);
  });

  it('is null for a provider and for any status but AGREED or PUBLISHED', () => {
    expect(buildInvoice(row({ kind: 'provider' }), DEFAULTS, ctx, NOW)).toBeNull();
    for (const status of ['NEW', 'READY', 'CONTACTED', 'CALLBACK', 'DECLINED', 'REGISTERED']) {
      expect(buildInvoice(row({ status }), DEFAULTS, ctx, NOW)).toBeNull();
    }
  });

  it('carries no id, phone, e-mail, note or token of a published site', () => {
    const text = JSON.stringify(buildInvoice(row(), DEFAULTS, ctx, NOW));
    for (const secret of [
      'ckprospect123',
      '+79001234567',
      '9001234567',
      'owner@ulybka.ru',
      'перезвонить',
      TOKEN,
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(Object.keys(buildInvoice(row(), DEFAULTS, ctx, NOW) ?? {})).not.toContain('id');
  });
});

describe('billing: formatDayMsk', () => {
  it('formats the Moscow day', () => {
    expect(formatDayMsk(new Date('2026-11-09T12:00:00Z'))).toBe('09.11.2026');
    expect(formatDayMsk(new Date('2026-12-31T21:30:00Z'))).toBe('01.01.2027');
  });
});

describe('billing: the yearly price (К12)', () => {
  const PLAN = { setup: 3900, monthly: 990, yearly: 9900 };
  const bare = {
    setupPrice: null,
    monthlyPrice: null,
    setupPaidAt: null,
    paidUntil: null,
  } satisfies BillingProspect;

  it('the base year at the base month, the same discount for an own month, 12 months without a setting', () => {
    expect(clientYearly(bare, PLAN)).toBe(9900);
    expect(clientYearly({ ...bare, monthlyPrice: 1500 }, PLAN)).toBe(15000);
    expect(clientYearly({ ...bare, monthlyPrice: 0 }, PLAN)).toBe(0);
    expect(clientYearly(bare, { setup: 3900, monthly: 990 })).toBe(11880);
  });

  it('the invoice shows the yearly price of the package, also for the domain package', () => {
    const row: InvoiceRow = {
      ...bare,
      kind: 'site',
      status: 'PUBLISHED',
      name: 'Улыбка',
      city: null,
      slug: 'ulybka',
      token: 'a'.repeat(32),
      domain: 'ulybka.ru',
    };
    const ctx = { payDetails: null, vatRate: 22, baseUrl: 'https://example.ru' };
    expect(buildInvoice(row, PLAN, ctx, NOW)?.yearly).toBe(9900);
    expect(buildInvoice({ ...row, domain: null }, PLAN, ctx, NOW)?.yearly).toBe(9900);
  });

  it('the «year» payment extends by twelve months', () => {
    const until = paymentUpdate({ paidUntil: null }, 'year', NOW).paidUntil;
    expect(until && formatDayMsk(until)).toBe('09.11.2027');
  });
});

describe('billing: mapLinkGuide (К16)', () => {
  it('two sections, Yandex Maps and 2GIS, each with the site address in a step', () => {
    const guide = mapLinkGuide('https://ulybka-kazan.ru/');
    expect(guide.map((s) => s.title)).toEqual(['Яндекс Карты', '2ГИС']);
    for (const section of guide) {
      expect(section.steps.length).toBeGreaterThanOrEqual(3);
      expect(section.steps.some((step) => step.includes('https://ulybka-kazan.ru/'))).toBe(true);
    }
    expect(JSON.stringify(guide)).not.toMatch(/кабинет|вкладк/i);
  });
});

describe('billing: счёт-оферта (К8) — номер, дата, НДС, покупатель', () => {
  const TOKEN = '0123456789abcdef0123456789abcdef';
  const AGREED = new Date('2026-11-05T09:00:00Z'); // 12:00 по Москве, 05.11.2026
  const row = (patch: Partial<InvoiceRow> = {}): InvoiceRow => ({
    kind: 'site',
    status: 'PUBLISHED',
    name: 'Дента',
    city: 'Казань',
    slug: 'denta',
    token: TOKEN,
    domain: null,
    agreedAt: AGREED,
    ...client(),
    ...patch,
  });
  const ctx = { payDetails: 'р/с …', baseUrl: 'https://example.ru', vatRate: 22 };
  const PRICES = { setup: 3900, monthly: 990 };

  it('НДС внутри суммы: 3 900 ₽ при 22 % — 703,28 ₽; ставка 0 — НДС не облагается', () => {
    expect(vatIncluded(3900, 22)).toBe(703.28);
    expect(vatIncluded(990, 22)).toBe(178.52);
    expect(vatIncluded(3900, 5)).toBe(185.71);
    expect(vatIncluded(3900, 0)).toBe(0);
    expect(rubKop(703.28)).toBe('703,28');
    expect(rubKop(1234567.5)).toBe(`${rub(1234567)},50`);
    expect(vatLine(3900, 22)).toBe('в т.ч. НДС 22\u00a0% — 703,28\u00a0₽');
    expect(vatLine(3900, 0)).toBe('НДС не облагается');
    expect(bankVatClause(3900, 22)).toBe('в т.ч. НДС 22% - 703,28 руб.');
    expect(bankVatClause(1_234_567, 20)).toBe('в т.ч. НДС 20% - 205 761,17 руб.');
    expect(bankVatClause(3900, 0)).toBe('НДС не облагается');
  });

  it('счёт за сайт: номер из дня договорённости и кода клиента, дата — день договорённости', () => {
    const view = buildInvoice(row(), PRICES, ctx, NOW);
    expect(view?.number).toMatch(/^САЙТ-261105-\d{6}$/);
    expect(view?.issuedOn).toBe('05.11.2026');
    expect(view?.vatLine).toBe('в т.ч. НДС 22\u00a0% — 703,28\u00a0₽');
    // Назначение платежа — для поля банка: без неразрывных пробелов, длинного тире и знака ₽.
    expect(view?.paymentPurpose).toBe(
      `Оплата по счёту № ${view?.number} от 05.11.2026 за создание сайта для компании «Дента», в т.ч. НДС 22% - 703,28 руб.`,
    );
    expect(view?.paymentPurpose).not.toMatch(/[\u00a0—₽]/);
    expect(view?.offerHref).toBe('https://example.ru/sajt-pod-klyuch/oferta');
    // Номер и дата не зависят от того, когда счёт открыли.
    const later = buildInvoice(row(), PRICES, ctx, new Date(NOW.getTime() + 3 * DAY));
    expect(later?.number).toBe(view?.number);
    expect(later?.issuedOn).toBe('05.11.2026');
    // У другого клиента в тот же день — другой номер.
    const other = buildInvoice(
      row({ token: 'fedcba9876543210fedcba9876543210' }),
      PRICES,
      ctx,
      NOW,
    );
    expect(other?.number).not.toBe(view?.number);
  });

  it('счёт за поддержку: тот же номер с «-П<год и месяц>», дата — когда период стал к оплате', () => {
    const paidAt = new Date('2026-11-06T09:00:00Z');
    const paidUntil = new Date('2026-12-06T09:00:00Z');
    const soon = new Date('2026-12-02T09:00:00Z'); // до конца оплаты 4 дня — пора платить
    const setup = buildInvoice(row(), PRICES, ctx, NOW);
    const view = buildInvoice(row({ setupPaidAt: paidAt, paidUntil }), PRICES, ctx, soon);
    expect(view?.due).toMatchObject({ amount: 990, kind: 'support' });
    expect(view?.number).toBe(`${setup?.number}-П2612`);
    // За EXPIRING_DAYS (7) до конца оплаченного срока.
    expect(view?.issuedOn).toBe('29.11.2026');
    expect(view?.vatLine).toBe('в т.ч. НДС 22\u00a0% — 178,52\u00a0₽');
    expect(view?.paymentPurpose).toMatch(/в т\.ч\. НДС 22% - 178,52 руб\.$/);
    expect(view?.paymentPurpose).toContain('за работу и поддержку сайта компании «Дента»');
    // Оплату отметили — срок сдвинулся, следующий счёт получит новый номер.
    const next = invoiceIdentity(
      {
        token: TOKEN,
        agreedAt: AGREED,
        setupPaidAt: paidAt,
        paidUntil: new Date('2027-01-06T09:00:00Z'),
      },
      'support',
      soon,
    );
    expect(next.number).toBe(`${setup?.number}-П2701`);
  });

  it('платить нечего — нет ни номера, ни строки НДС; ставка 0 — «НДС не облагается»', () => {
    const paid = buildInvoice(
      row({ setupPaidAt: NOW, paidUntil: new Date(NOW.getTime() + 20 * DAY) }),
      PRICES,
      ctx,
      NOW,
    );
    expect(paid).toMatchObject({ due: null, number: null, issuedOn: null, vatLine: null });
    const noVat = buildInvoice(row(), PRICES, { ...ctx, vatRate: 0 }, NOW);
    expect(noVat?.vatLine).toBe('НДС не облагается');
    expect(noVat?.paymentPurpose).toMatch(/«Дента», НДС не облагается$/);
  });

  it('покупатель: реквизиты владельца, иначе только название компании', () => {
    expect(buildInvoice(row(), PRICES, ctx, NOW)?.buyer).toBeNull();
    expect(
      buildInvoice(row({ buyerDetails: '  ООО «Дента», ИНН 1650000000  ' }), PRICES, ctx, NOW)
        ?.buyer,
    ).toBe('ООО «Дента», ИНН 1650000000');
    expect(buildInvoice(row({ buyerDetails: '   ' }), PRICES, ctx, NOW)?.buyer).toBeNull();
  });

  it('отказ и новое «Согласился» — новая договорённость: у счёта новый номер и дата', () => {
    const first = buildInvoice(row(), PRICES, ctx, NOW);
    const again = buildInvoice(
      row({ agreedAt: new Date('2026-11-12T09:00:00Z') }),
      PRICES,
      ctx,
      NOW,
    );
    expect(first?.number).toMatch(/^САЙТ-261105-/);
    expect(again?.number).toMatch(/^САЙТ-261112-/);
    expect(again?.issuedOn).toBe('12.11.2026');
    // Код клиента в номере тот же: счёт по-прежнему узнаётся.
    expect(again?.number?.slice(-6)).toBe(first?.number?.slice(-6));
  });

  it('строка без дня договорённости (старые клиенты) берёт день создания', () => {
    const view = buildInvoice(
      row({ agreedAt: null, createdAt: new Date('2026-10-30T20:59:00Z') }),
      PRICES,
      ctx,
      NOW,
    );
    // 23:59 по Москве — ещё 30 октября.
    expect(view?.number).toMatch(/^САЙТ-261030-/);
    expect(view?.issuedOn).toBe('30.10.2026');
  });
});
