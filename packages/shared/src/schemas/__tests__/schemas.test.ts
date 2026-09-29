import { describe, expect, it } from 'vitest';
import {
  createBidSchema,
  createBookingSchema,
  createEquipmentSchema,
  emailSchema,
  equipmentSearchQuerySchema,
  loginSchema,
  normalizeEmail,
  registerSchema,
} from '../../index';

const CUID = 'cjld2cjxh0000qzrmn831i7rn';

describe('createEquipmentSchema', () => {
  it('accepts only https image links', () => {
    const base = { name: 'Кран', categoryId: CUID, companyId: CUID, dailyRate: 1000 };
    expect(
      createEquipmentSchema.safeParse({ ...base, imageUrls: ['https://cdn.example.com/a.jpg'] })
        .success,
    ).toBe(true);
    for (const url of ['http://example.com/a.jpg', 'javascript:alert(1)', 'data:image/png,xx']) {
      expect(createEquipmentSchema.safeParse({ ...base, imageUrls: [url] }).success).toBe(false);
    }
  });

  it('applies defaults for currency and imageUrls', () => {
    const result = createEquipmentSchema.parse({
      name: 'Экскаватор JCB 3CX',
      categoryId: CUID,
      companyId: CUID,
      dailyRate: 15000,
    });
    expect(result.currency).toBe('RUB');
    expect(result.imageUrls).toEqual([]);
  });

  it('rejects a non-positive dailyRate and a non-cuid categoryId', () => {
    const result = createEquipmentSchema.safeParse({
      name: 'Кран',
      categoryId: 'not-a-cuid',
      companyId: CUID,
      dailyRate: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('dailyRate');
      expect(paths).toContain('categoryId');
    }
  });
});

describe('createBookingSchema', () => {
  it('coerces ISO strings to dates and requires endDate after startDate', () => {
    const ok = createBookingSchema.parse({
      equipmentId: CUID,
      customerId: CUID,
      startDate: '2026-10-01',
      endDate: '2026-10-05',
    });
    expect(ok.startDate).toBeInstanceOf(Date);
    expect(ok.endDate.getTime()).toBeGreaterThan(ok.startDate.getTime());

    const bad = createBookingSchema.safeParse({
      equipmentId: CUID,
      customerId: CUID,
      startDate: '2026-10-05',
      endDate: '2026-10-01',
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0]?.path).toEqual(['endDate']);
    }
  });
});

describe('registerSchema', () => {
  it('discriminates on accountType and requires companyName for providers', () => {
    const customer = registerSchema.safeParse({
      accountType: 'CUSTOMER',
      name: 'Иван',
      email: 'ivan@example.com',
      password: 'password123',
      consent: true,
    });
    expect(customer.success).toBe(true);

    const providerWithoutCompany = registerSchema.safeParse({
      accountType: 'PROVIDER',
      name: 'ООО Техника',
      email: 'ops@example.com',
      password: 'password123',
      consent: true,
    });
    expect(providerWithoutCompany.success).toBe(false);

    const shortPassword = registerSchema.safeParse({
      accountType: 'CUSTOMER',
      name: 'Иван',
      email: 'ivan@example.com',
      password: 'short',
      consent: true,
    });
    expect(shortPassword.success).toBe(false);
  });

  it('requires consent to the processing of personal data', () => {
    const base = {
      accountType: 'CUSTOMER',
      name: 'Иван',
      email: 'ivan@example.com',
      password: 'password123',
    };
    expect(registerSchema.safeParse(base).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, consent: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, consent: true }).success).toBe(true);
  });

  it('normalizes email to trimmed lower case', () => {
    const result = registerSchema.parse({
      accountType: 'CUSTOMER',
      name: 'Иван',
      email: '  Ivan.Petrov@Example.COM ',
      password: 'password123',
      consent: true,
    });
    expect(result.email).toBe('ivan.petrov@example.com');
  });
});

describe('loginSchema and emailSchema', () => {
  it('normalizes email and requires a password', () => {
    expect(loginSchema.parse({ email: ' USER@Example.com', password: 'x' }).email).toBe(
      'user@example.com',
    );
    expect(loginSchema.safeParse({ email: 'user@example.com', password: '' }).success).toBe(false);
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(normalizeEmail('  A@B.CO ')).toBe('a@b.co');
  });
});

describe('equipmentSearchQuerySchema and createBidSchema', () => {
  it('fills pagination defaults and caps pageSize at 100', () => {
    expect(equipmentSearchQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 20,
      sort: 'newest',
    });
    expect(equipmentSearchQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it('accepts known sort values and rejects unknown ones', () => {
    expect(equipmentSearchQuerySchema.parse({ sort: 'price_asc' }).sort).toBe('price_asc');
    expect(equipmentSearchQuerySchema.safeParse({ sort: 'random' }).success).toBe(false);
  });

  it('requires a 3-letter currency and a positive price for bids', () => {
    expect(createBidSchema.parse({ orderId: CUID, equipmentId: CUID, price: 100 }).currency).toBe(
      'RUB',
    );
    expect(
      createBidSchema.safeParse({ orderId: CUID, equipmentId: CUID, price: 100, currency: 'RUBL' })
        .success,
    ).toBe(false);
    expect(createBidSchema.safeParse({ orderId: CUID, equipmentId: CUID, price: -5 }).success).toBe(
      false,
    );
  });
});
