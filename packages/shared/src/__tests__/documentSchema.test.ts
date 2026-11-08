import { describe, expect, it } from 'vitest';
import { createProviderDocumentSchema, updateProviderDocumentSchema } from '../schemas/document';

describe('document dates', () => {
  it('reads an empty date as «без срока», never 1970-01-01', () => {
    for (const empty of [null, '', '  ', 0, '0', false, undefined]) {
      const created = createProviderDocumentSchema.parse({
        kind: 'OSAGO',
        expiresAt: empty,
        issuedAt: empty,
      });
      expect(created.expiresAt).toBeNull();
      expect(created.issuedAt).toBeNull();
      const updated = updateProviderDocumentSchema.parse({ expiresAt: empty });
      expect(updated.expiresAt).toBeNull();
    }
  });

  it('keeps a real date and refuses garbage', () => {
    const created = createProviderDocumentSchema.parse({ kind: 'OSAGO', expiresAt: '2027-03-01' });
    expect(created.expiresAt?.toISOString().slice(0, 10)).toBe('2027-03-01');
    expect(
      createProviderDocumentSchema.safeParse({ kind: 'OSAGO', expiresAt: 'завтра' }).success,
    ).toBe(false);
  });
});
