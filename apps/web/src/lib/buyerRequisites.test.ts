import { describe, expect, it, vi } from 'vitest';
import {
  buyerChoice,
  buyerForProvider,
  buyerLine,
  parseBuyer,
  resolveBuyer,
} from './buyerRequisites';

const romashka = {
  legalForm: 'LEGAL',
  name: 'ООО «Ромашка»',
  inn: '7707083893',
  kpp: '773601001',
  address: 'г. Казань, ул. Баумана, 1',
};

function db(rows: Array<typeof romashka & { id: string; userId: string; isDefault: boolean }>) {
  const findFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    const row = rows.find(
      (r) =>
        r.userId === where.userId &&
        (where.id === undefined || r.id === where.id) &&
        (where.isDefault === undefined || r.isDefault === where.isDefault),
    );
    if (!row) return null;
    const { legalForm, name, inn, kpp, address } = row;
    return { legalForm, name, inn, kpp, address };
  });
  return { legalEntity: { findFirst } };
}

describe('buyerForProvider', () => {
  it('hides the buyer until the booking is confirmed', () => {
    expect(buyerForProvider(romashka, 'PENDING')).toBeNull();
    expect(buyerForProvider(romashka, 'CANCELLED')).toBeNull();
    for (const status of ['CONFIRMED', 'ACTIVE', 'COMPLETED']) {
      expect(buyerForProvider(romashka, status)).toEqual(romashka);
    }
  });

  it('treats a private-person order and broken json as no buyer', () => {
    expect(buyerForProvider(null, 'CONFIRMED')).toBeNull();
    expect(parseBuyer('ООО')).toBeNull();
    expect(parseBuyer({ name: 'x' })).toBeNull();
  });
});

describe('buyerChoice', () => {
  it('reads the form field', () => {
    expect(buyerChoice(undefined)).toEqual({ kind: 'default' });
    expect(buyerChoice('person')).toEqual({ kind: 'person' });
    expect(buyerChoice(null)).toEqual({ kind: 'person' });
    expect(buyerChoice('abc')).toEqual({ kind: 'entity', id: 'abc' });
    expect(buyerChoice(5)).toEqual({ kind: 'invalid' });
  });
});

describe('resolveBuyer', () => {
  const rows = [
    { ...romashka, id: 'e1', userId: 'u1', isDefault: true },
    { ...romashka, name: 'ИП Петров', id: 'e2', userId: 'u2', isDefault: true },
  ];

  it('takes the switcher choice when the field is missing', async () => {
    expect(await resolveBuyer(db(rows), 'u1', undefined)).toEqual({ buyer: romashka });
    expect(await resolveBuyer(db(rows), 'u3', undefined)).toEqual({ buyer: null });
  });

  it('never snapshots someone else’s entity', async () => {
    expect(await resolveBuyer(db(rows), 'u1', 'e2')).toHaveProperty('error');
  });

  it('orders as a private person on request', async () => {
    expect(await resolveBuyer(db(rows), 'u1', 'person')).toEqual({ buyer: null });
  });
});

describe('buyerLine', () => {
  it('lists the requisites in one line', () => {
    expect(buyerLine(romashka)).toContain('ИНН 7707083893, КПП 773601001, г. Казань');
  });
});
