import { describe, expect, it } from 'vitest';
import {
  ipSubnet,
  PRICE_SURVEY_CONSENT_ERROR,
  personalFields,
  priceBoundsFor,
  priceInBounds,
  priceReportData,
  priceReportsCsv,
  type AdminPriceReport,
} from './priceReports';

const now = new Date('2026-10-18T09:00:00Z');
const base = { categorySlug: 'excavators', city: 'Казань', hourlyRate: 3500 };

describe('price bounds', () => {
  it('catch typos and jokes, generous per kind of machinery', () => {
    expect(priceBoundsFor('excavators')).toEqual([500, 30_000]);
    expect(priceBoundsFor('cranes')).toEqual([500, 60_000]);
    expect(priceInBounds('excavators', 3500)).toBe(true);
    expect(priceInBounds('excavators', 1)).toBe(false);
    expect(priceInBounds('excavators', 999_999)).toBe(false);
    expect(priceInBounds('cranes', 45_000)).toBe(true);
    expect(priceInBounds('excavators', 3500.5)).toBe(false);
    const refused = priceReportData({ ...base, hourlyRate: 35 }, now);
    expect(refused).toMatchObject({ ok: false });
    expect(!refused.ok && refused.error).toContain('от 500 до 30000');
  });

  it('only known machine types and cities', () => {
    expect(priceReportData({ ...base, categorySlug: 'spaceships' }, now).ok).toBe(false);
    expect(priceReportData({ ...base, city: 'Атлантида' }, now).ok).toBe(false);
    const ok = priceReportData({ ...base, city: 'казань' }, now);
    expect(ok).toMatchObject({
      ok: true,
      data: { city: 'Казань', region: 'Республика Татарстан' },
    });
  });
});

describe('consent gates personal data', () => {
  it('without name, company and phone nothing personal is stored', () => {
    const result = priceReportData({ ...base, wantsOrders: true }, now);
    expect(result).toEqual({
      ok: true,
      data: {
        categorySlug: 'excavators',
        city: 'Казань',
        region: 'Республика Татарстан',
        hourlyRate: 3500,
        companyName: null,
        contactName: null,
        phone: null,
        wantsOrders: true,
        consentAt: null,
      },
    });
  });

  it('a name or a phone without the consent tick is refused', () => {
    expect(priceReportData({ ...base, contactName: 'Иван' }, now)).toEqual({
      ok: false,
      error: PRICE_SURVEY_CONSENT_ERROR,
    });
    expect(priceReportData({ ...base, phone: '+7 900 000-00-00' }, now).ok).toBe(false);
    expect(priceReportData({ ...base, companyName: 'ООО Ромашка', consent: false }, now).ok).toBe(
      false,
    );
  });

  it('with the tick they are kept, with the moment of consent', () => {
    const result = priceReportData(
      { ...base, contactName: ' Иван ', phone: '+7 900 000-00-00', consent: true },
      now,
    );
    expect(result).toMatchObject({
      ok: true,
      data: { contactName: 'Иван', phone: '+7 900 000-00-00', consentAt: now },
    });
  });

  it('a phone must look like a phone', () => {
    expect(priceReportData({ ...base, phone: 'позвоните', consent: true }, now).ok).toBe(false);
    expect(priceReportData({ ...base, phone: '123', consent: true }, now).ok).toBe(false);
  });
});

describe('the owner’s CSV', () => {
  const report = (extra: Partial<AdminPriceReport> = {}): AdminPriceReport => ({
    id: 'r1',
    categorySlug: 'excavators',
    city: 'Казань',
    region: 'Республика Татарстан',
    hourlyRate: 3500,
    companyName: null,
    contactName: null,
    phone: null,
    wantsOrders: false,
    consentAt: null,
    source: 'web',
    createdAt: now,
    ...extra,
  });

  it('opens in Excel (BOM, «;») and never shows personal data without consent', () => {
    const csv = priceReportsCsv([
      report({ contactName: 'Иван', phone: '+79000000000', consentAt: now, wantsOrders: true }),
      // A row with a phone but no consent (cannot be saved so, but even then).
      report({ id: 'r2', phone: '+79111111111', source: 'telegram' }),
    ]);
    expect(csv.startsWith('﻿"Дата (МСК)";"Вид техники"')).toBe(true);
    const [, first, second] = csv.trim().split('\r\n');
    expect(first).toContain('"Иван"');
    expect(first).toContain('"+79000000000"');
    expect(first).toContain('"да";"да";"сайт"');
    expect(second).not.toContain('79111111111');
    expect(second).toContain('"Telegram-бот"');
    expect(personalFields(report({ phone: '+7900', consentAt: null })).phone).toBeNull();
  });

  it('neutralises formulas', () => {
    const csv = priceReportsCsv([
      report({ companyName: '=HYPERLINK("x")', contactName: '+SUM(1)', consentAt: now }),
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"'+SUM(1)"`);
  });
});

describe('the network of a guest', () => {
  it('IPv4 /24, IPv6 /48 whatever the spelling', () => {
    expect(ipSubnet('10.6.0.1')).toBe('10.6.0');
    expect(ipSubnet('::ffff:10.6.0.9')).toBe('10.6.0');
    expect(ipSubnet('2a02:6b8::1')).toBe('2a02:6b8:0');
    expect(ipSubnet('2a02:6b8:0:1::5')).toBe('2a02:6b8:0');
    expect(ipSubnet('2A02:06B8:0000:0001:0000:0000:0000:0005')).toBe('2a02:6b8:0');
    expect(ipSubnet('2a02:6b8:12::')).toBe('2a02:6b8:12');
  });
});
