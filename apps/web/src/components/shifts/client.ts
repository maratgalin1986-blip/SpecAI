'use client';

// Small fetch helper for the shift / timesheet / operator / calendar widgets:
// JSON in, JSON out, the server's Russian error text or a fallback.
import type { ShiftJson, TimesheetJson } from '@/lib/shiftAccess';
import type { OperatorJson } from '@/lib/operatorStore';
import type { MachineCalendarJson } from '@/lib/calendarStore';

export type { ShiftJson, TimesheetJson, OperatorJson, MachineCalendarJson };

export class ClientError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function callApi<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ClientError(0, 'Нет связи с сервером, попробуйте ещё раз');
  }
  const data = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (!response.ok) {
    throw new ClientError(
      response.status,
      typeof data?.error === 'string' ? data.error : `Ошибка сервера (${response.status})`,
    );
  }
  return data as T;
}

export function errorText(error: unknown, fallback: string): string {
  return error instanceof ClientError ? error.message : fallback;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDay(iso: string): string {
  // "2026-10-08" is a calendar day; an instant is shown as its Moscow day.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return date.toLocaleDateString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
  });
}

/** Today in Moscow as YYYY-MM-DD, for date inputs. */
export function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
