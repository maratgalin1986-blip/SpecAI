import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/database', () => ({ prisma: {} }));

const {
  formatCard,
  isValidCard,
  luhnValid,
  normalizeCard,
  normalizeRecipient,
  parseSupportUpdate,
  publicSupport,
  settingsFromRows,
  SUPPORT_KEYS,
} = await import('./supportSettings');

// Well-known test numbers from payment documentation, never a real card.
const VISA_TEST = '4111111111111111';
const MC_TEST = '5555555555554444';

function withCheckDigit(body: string) {
  for (let d = 0; d <= 9; d += 1) if (luhnValid(body + d)) return body + d;
  throw new Error('no check digit');
}

describe('support card number', () => {
  it('normalises spaces and dashes, rejects letters', () => {
    expect(normalizeCard(' 4111 1111-1111 1111 ')).toBe(VISA_TEST);
    expect(normalizeCard('4111 1111 1111 111a')).toBeNull();
    expect(normalizeCard(42)).toBeNull();
    expect(normalizeCard('')).toBe('');
  });

  it('checks the Luhn sum', () => {
    expect(luhnValid(VISA_TEST)).toBe(true);
    expect(luhnValid(MC_TEST)).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
    expect(luhnValid('')).toBe(false);
  });

  it('accepts 16–19 digits with a valid checksum only', () => {
    expect(isValidCard(VISA_TEST)).toBe(true);
    expect(isValidCard(withCheckDigit('400000000000000000'))).toBe(true);
    expect(isValidCard('4111111111111112')).toBe(false);
    expect(isValidCard(withCheckDigit('41111111111111'))).toBe(false); // 15 digits
    expect(isValidCard(withCheckDigit('4'.repeat(19)))).toBe(false); // 20 digits
    expect(isValidCard(null)).toBe(false);
  });

  it('formats in groups of four', () => {
    expect(formatCard(VISA_TEST)).toBe('4111 1111 1111 1111');
    expect(formatCard('1234567890123456789')).toBe('1234 5678 9012 3456 789');
  });

  it('keeps the recipient short and on one line', () => {
    expect(normalizeRecipient('  Иван \n И. ')).toBe('Иван И.');
    expect(normalizeRecipient('   ')).toBeNull();
    expect(normalizeRecipient('я'.repeat(80))).toHaveLength(60);
    expect(normalizeRecipient(5)).toBeNull();
  });
});

describe('support settings', () => {
  const rows = (card: string, enabled: string, recipient?: string) => [
    { key: SUPPORT_KEYS.card, value: card },
    { key: SUPPORT_KEYS.enabled, value: enabled },
    ...(recipient ? [{ key: SUPPORT_KEYS.recipient, value: recipient }] : []),
  ];

  it('publishes the formatted card only when on and valid', () => {
    expect(publicSupport(settingsFromRows(rows(VISA_TEST, '1', 'Иван И.')))).toEqual({
      enabled: true,
      card: '4111 1111 1111 1111',
      recipient: 'Иван И.',
      amounts: [100, 300, 500],
    });
  });

  it('hides everything when off, invalid or missing', () => {
    expect(publicSupport(settingsFromRows(rows(VISA_TEST, '0', 'Иван И.')))).toEqual({
      enabled: false,
    });
    expect(publicSupport(settingsFromRows(rows('4111111111111112', '1')))).toEqual({
      enabled: false,
    });
    expect(publicSupport(settingsFromRows(rows('not a card', '1')))).toEqual({ enabled: false });
    expect(publicSupport(settingsFromRows([]))).toEqual({ enabled: false });
    expect(publicSupport(settingsFromRows(rows(VISA_TEST, 'yes')))).toEqual({ enabled: false });
  });

  it('validates the admin form', () => {
    expect(
      parseSupportUpdate({ card: '4111 1111 1111 1111', recipient: ' Иван ', enabled: true }),
    ).toEqual({ ok: true, value: { card: VISA_TEST, recipient: 'Иван', enabled: true } });
    expect(parseSupportUpdate({ card: '', enabled: false })).toEqual({
      ok: true,
      value: { card: '', recipient: null, enabled: false },
    });
    expect(parseSupportUpdate({ card: '4111111111111112', enabled: false }).ok).toBe(false);
    expect(parseSupportUpdate({ card: '1234', enabled: false }).ok).toBe(false);
    expect(parseSupportUpdate({ card: '', enabled: true }).ok).toBe(false);
    expect(parseSupportUpdate({ card: VISA_TEST }).ok).toBe(false);
    expect(parseSupportUpdate({ card: VISA_TEST, recipient: 7, enabled: true }).ok).toBe(false);
    expect(parseSupportUpdate(null).ok).toBe(false);
  });
});
