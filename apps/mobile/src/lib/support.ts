import { useEffect, useState } from 'react';
import { apiFetch } from './api';
import { STORAGE_KEYS, getItem, setItem } from './storage';

/**
 * «Поддержать ИИСтройка24» (владелец, 2026-10-17): после завершённого заказа
 * заказчик и исполнитель видят тихую карточку — можно поддержать площадку
 * любой суммой переводом по номеру карты в своём банке. Номер карты владелец
 * задаёт в меню администратора; в коде его нет. Карточка показывается, пока
 * среди завершённых броней есть такая, по которой её не закрыли («Не сейчас»
 * или скопировали номер). Закрытые брони хранятся только на этом телефоне.
 */
export const SUPPORT_TEXT = {
  title: 'Поддержать ИИСтройка24',
  body: 'Площадка бесплатная. Если она помогла — можно поддержать её развитие любой суммой. Это добровольно.',
  custom: 'Своя сумма',
  copy: 'Скопировать номер карты',
  thanks: 'Спасибо!',
  hint: 'Перевод по номеру карты в приложении вашего банка',
  later: 'Не сейчас',
  row: 'Поддержать приложение',
} as const;

export type PublicSupport =
  { enabled: false } | { enabled: true; card: string; recipient: string | null; amounts: number[] };

/** Сколько завершённых броней (первых в списке) учитываем. */
export const SUPPORT_TRACKED = 30;
/** Сколько закрытых броней помним: хватает на учитываемые, строка короткая. */
export const SUPPORT_KEEP = 60;

/** Ответ /api/support с проверкой: всё непонятное — «выключено». */
export function parseSupport(body: unknown): PublicSupport {
  if (!body || typeof body !== 'object') return { enabled: false };
  const value = body as Record<string, unknown>;
  if (
    value.enabled !== true ||
    typeof value.card !== 'string' ||
    !/^[\d ]{16,23}$/.test(value.card)
  )
    return { enabled: false };
  return {
    enabled: true,
    card: value.card,
    recipient: typeof value.recipient === 'string' && value.recipient ? value.recipient : null,
    amounts: Array.isArray(value.amounts)
      ? value.amounts.filter((n): n is number => Number.isInteger(n) && n > 0)
      : [],
  };
}

/** Номер для копирования: только цифры. */
export function cardDigits(card: string): string {
  return card.replace(/\D/g, '');
}

export function completedBookingIds(bookings: readonly { id: string; status: string }[]): string[] {
  return bookings
    .filter((booking) => booking.status === 'COMPLETED')
    .slice(0, SUPPORT_TRACKED)
    .map((booking) => booking.id);
}

export function shouldOfferSupport(
  enabled: boolean,
  completedIds: readonly string[],
  dismissed: readonly string[],
): boolean {
  if (!enabled) return false;
  const closed = new Set(dismissed);
  return completedIds.some((id) => !closed.has(id));
}

export function parseDismissedIds(stored: string | null | undefined): string[] {
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && id.length <= 64)
      : [];
  } catch {
    return [];
  }
}

/** Новые закрытые — в начало; старые отпадают после SUPPORT_KEEP. */
export function withDismissed(dismissed: readonly string[], ids: readonly string[]): string[] {
  return [...new Set([...ids, ...dismissed])].slice(0, SUPPORT_KEEP);
}

export interface SupportStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

const defaultStorage: SupportStorage = { getItem, setItem };

export async function readDismissedIds(storage: SupportStorage = defaultStorage) {
  try {
    return parseDismissedIds(await storage.getItem(STORAGE_KEYS.supportDismissed));
  } catch {
    return [];
  }
}

/** Запомнить закрытые брони; если хранилище недоступно — карточка может появиться снова. */
export async function rememberDismissedIds(
  ids: readonly string[],
  storage: SupportStorage = defaultStorage,
): Promise<string[]> {
  const next = withDismissed(await readDismissedIds(storage), ids);
  try {
    await storage.setItem(STORAGE_KEYS.supportDismissed, JSON.stringify(next));
  } catch {
    // Хранилище недоступно — ничего страшного.
  }
  return next;
}

const CACHE_MS = 5 * 60 * 1000;
let cached: { at: number; value: Promise<PublicSupport> } | null = null;

/** Реквизиты с сервера; не чаще раза в 5 минут, ошибка — «выключено» и повтор позже. */
export function fetchSupport(now: number = Date.now()): Promise<PublicSupport> {
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  const value = apiFetch<unknown>('/api/support', { anonymous: true })
    .then(parseSupport)
    .catch(() => {
      cached = null;
      return { enabled: false } as const;
    });
  cached = { at: now, value };
  return value;
}

export function useSupport(): PublicSupport | null {
  const [support, setSupport] = useState<PublicSupport | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchSupport().then((value) => {
      if (alive) setSupport(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return support;
}
