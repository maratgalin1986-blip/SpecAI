import { prisma } from '@specai/database';
import { SUPPORT_AMOUNTS } from '@/lib/prices';

/**
 * «Поддержать площадку» (owner, 2026-10-17): after a completed booking the
 * customer and the provider see a quiet offer to support the platform with any
 * amount, by a transfer to the owner's card in their own bank app. Later the
 * platform takes a commission instead. The card is set by the owner in the
 * admin menu (site and app) and lives only in the AppSetting table: the
 * repository is public, so no real requisites in code, tests or docs.
 */
export const SUPPORT_KEYS = {
  card: 'support.card',
  recipient: 'support.recipient',
  enabled: 'support.enabled',
} as const;

const KEY_LIST = Object.values(SUPPORT_KEYS);

/** How the recipient shows in the bank («Марат Г.»): short, one line. */
export const RECIPIENT_MAX = 60;

/** «4111 1111-…» → digits only; anything other than digits, spaces and dashes → null. */
export function normalizeCard(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!/^[\d\s-]*$/.test(trimmed)) return null;
  return trimmed.replace(/[\s-]/g, '');
}

/** The Luhn checksum every bank card number carries. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** A card number: 16–19 digits with a valid checksum (Mir, Visa, Mastercard). */
export function isValidCard(digits: string | null | undefined): digits is string {
  return typeof digits === 'string' && /^\d{16,19}$/.test(digits) && luhnValid(digits);
}

/** «4111111111111111» → «4111 1111 1111 1111» (groups of four). */
export function formatCard(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** Trimmed, one line, at most RECIPIENT_MAX characters; empty → null. */
export function normalizeRecipient(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const value = input.replace(/\s+/g, ' ').trim().slice(0, RECIPIENT_MAX).trim();
  return value || null;
}

export interface SupportSettings {
  /** Digits only, '' when not set. */
  card: string;
  recipient: string | null;
  enabled: boolean;
  updatedAt: string | null;
}

/** Stored rows → settings. Junk in the table never turns the offer on. */
export function settingsFromRows(
  rows: readonly { key: string; value: string; updatedAt?: Date | string | null }[],
): SupportSettings {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const card = normalizeCard(byKey.get(SUPPORT_KEYS.card)?.value ?? '') ?? '';
  const updated = rows
    .map((row) => (row.updatedAt ? new Date(row.updatedAt).getTime() : NaN))
    .filter((time) => Number.isFinite(time));
  return {
    card,
    recipient: normalizeRecipient(byKey.get(SUPPORT_KEYS.recipient)?.value),
    enabled: byKey.get(SUPPORT_KEYS.enabled)?.value === '1',
    updatedAt: updated.length ? new Date(Math.max(...updated)).toISOString() : null,
  };
}

export async function loadSupportSettings(): Promise<SupportSettings> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: KEY_LIST } },
    orderBy: { key: 'asc' },
    take: KEY_LIST.length,
  });
  return settingsFromRows(rows);
}

export type PublicSupport =
  | { enabled: false }
  | { enabled: true; card: string; recipient: string | null; amounts: readonly number[] };

/** What everyone may see: the formatted card only when it is on and valid. */
export function publicSupport(settings: SupportSettings): PublicSupport {
  if (!settings.enabled || !isValidCard(settings.card)) return { enabled: false };
  return {
    enabled: true,
    card: formatCard(settings.card),
    recipient: settings.recipient,
    amounts: SUPPORT_AMOUNTS,
  };
}

export type SupportUpdate = { card: string; recipient: string | null; enabled: boolean };

/**
 * The admin form → values to store, or the reason in plain Russian. An empty
 * card clears it (and the offer cannot be on without one).
 */
export function parseSupportUpdate(
  body: unknown,
): { ok: true; value: SupportUpdate } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Пустой запрос' };
  const input = body as Record<string, unknown>;
  const card = normalizeCard(input.card ?? '');
  if (card === null || (card !== '' && !isValidCard(card))) {
    return {
      ok: false,
      error: 'Проверьте номер карты: 16–19 цифр, как на карте, без ошибок',
    };
  }
  if (input.recipient !== undefined && input.recipient !== null) {
    if (typeof input.recipient !== 'string') {
      return { ok: false, error: 'Имя получателя — строкой' };
    }
  }
  if (typeof input.enabled !== 'boolean') {
    return { ok: false, error: 'Укажите, включена ли поддержка' };
  }
  if (input.enabled && !card) {
    return { ok: false, error: 'Чтобы включить поддержку, укажите номер карты' };
  }
  return {
    ok: true,
    value: { card, recipient: normalizeRecipient(input.recipient), enabled: input.enabled },
  };
}

export async function saveSupportSettings(update: SupportUpdate): Promise<SupportSettings> {
  const upsert = (key: string, value: string) =>
    prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  await prisma.$transaction([
    update.card
      ? upsert(SUPPORT_KEYS.card, update.card)
      : prisma.appSetting.deleteMany({ where: { key: SUPPORT_KEYS.card } }),
    update.recipient
      ? upsert(SUPPORT_KEYS.recipient, update.recipient)
      : prisma.appSetting.deleteMany({ where: { key: SUPPORT_KEYS.recipient } }),
    upsert(SUPPORT_KEYS.enabled, update.enabled ? '1' : '0'),
  ]);
  return loadSupportSettings();
}
