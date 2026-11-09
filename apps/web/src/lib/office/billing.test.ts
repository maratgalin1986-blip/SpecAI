import { describe, expect, it } from 'vitest';
import { SITE_DOMAIN_SETUP_EXTRA } from '@/lib/prices';
import {
  billingStatus,
  billingSummary,
  buildInvoice,
  byBillingUrgency,
  clientPackage,
  clientPrices,
  extendPaidUntil,
  formatDayMsk,
  invoiceDue,
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
    ...client(),
    ...patch,
  });
  const ctx = { payDetails: '  ООО «Пример», р/с …  ', baseUrl: 'https://example.ru/' };

  it('shows the company, the package, the prices and the published site', () => {
    const view = buildInvoice(row(), DEFAULTS, ctx, NOW);
    expect(view).toMatchObject({
      company: 'Стоматология «Улыбка»',
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

  it("uses the client's domain, the domain package and the client's own prices", () => {
    const view = buildInvoice(
      row({ domain: 'ulybka-kazan.ru', monthlyPrice: 1000, setupPaidAt: NOW, paidUntil: NOW }),
      DEFAULTS,
      { payDetails: '   ', baseUrl: 'https://example.ru' },
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
