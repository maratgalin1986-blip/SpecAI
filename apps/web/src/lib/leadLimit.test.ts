import { describe, expect, it, vi } from 'vitest';
import { checkPhoneLeadLimit, normalizePhone, phoneLimitMessage } from './leadLimit';

const NOW = Date.parse('2026-10-03T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60 * 1000);
const rows = (phone: string, ...minutes: number[]) =>
  minutes.map((m) => ({ phone, createdAt: minutesAgo(m) }));

describe('normalizePhone', () => {
  it('brings 8…, +7… and 10-digit forms to one key', () => {
    expect(normalizePhone('8 (900) 000-00-01')).toBe('79000000001');
    expect(normalizePhone('+7 900 000-00-01')).toBe('79000000001');
    expect(normalizePhone('9000000001')).toBe('79000000001');
  });
});

describe('checkPhoneLeadLimit (database)', () => {
  it('allows the 3rd lead in 10 minutes and refuses the 4th', async () => {
    const two = vi.fn().mockResolvedValue(rows('+79000000001', 1, 2));
    await expect(checkPhoneLeadLimit('8 900 000-00-01', two, NOW)).resolves.toEqual({ ok: true });
    const three = vi.fn().mockResolvedValue(rows('8 (900) 000-00-01', 1, 2, 9));
    await expect(checkPhoneLeadLimit('+7 900 000-00-01', three, NOW)).resolves.toEqual({
      ok: false,
      reason: 'burst',
    });
  });

  it('counts only the same normalised phone', async () => {
    const lookup = vi.fn().mockResolvedValue(rows('+79110000001', 1, 2, 3, 4));
    await expect(checkPhoneLeadLimit('+79000000001', lookup, NOW)).resolves.toEqual({ ok: true });
  });

  it('refuses more than 10 leads a day', async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue(rows('+79000000001', 30, 60, 90, 120, 200, 300, 400, 500, 600, 700));
    await expect(checkPhoneLeadLimit('+79000000001', lookup, NOW)).resolves.toEqual({
      ok: false,
      reason: 'daily',
    });
    expect(lookup).toHaveBeenCalledWith('79000000001', new Date(NOW - 24 * 60 * 60 * 1000));
  });

  it('skips leads without a phone number', async () => {
    const lookup = vi.fn();
    await expect(checkPhoneLeadLimit('—', lookup, NOW)).resolves.toEqual({ ok: true });
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('checkPhoneLeadLimit (database down)', () => {
  it('never blocks on the error and falls back to memory', async () => {
    const down = vi.fn().mockRejectedValue(new Error('db down'));
    const phone = '+7 900 555-00-02';
    for (let i = 0; i < 3; i += 1) {
      await expect(checkPhoneLeadLimit(phone, down)).resolves.toEqual({ ok: true });
    }
    await expect(checkPhoneLeadLimit(phone, down)).resolves.toEqual({
      ok: false,
      reason: 'burst',
    });
  });
});

describe('phoneLimitMessage', () => {
  it('is friendly and gives the number to call', () => {
    const text = phoneLimitMessage('+7 (927) 242-80-88');
    expect(text).toContain('+7 (927) 242-80-88');
    expect(text).toContain('перезвоним');
  });
});
