import { describe, expect, it } from 'vitest';
import { applyAction } from './transitions';
import type { ProspectStatus } from './types';

// 12:00 по Москве 10 ноября 2026.
const now = new Date('2026-11-10T09:00:00.000Z');
const tomorrow = new Date('2026-11-11T07:00:00.000Z');
// 23:30 по Москве того же дня — ещё «сегодня».
const lateToday = new Date('2026-11-10T20:30:00.000Z');
// 02:00 по Москве того же дня (23:00 UTC накануне) — тоже «сегодня» по Москве.
const earlyToday = new Date('2026-11-09T23:00:00.000Z');
const yesterday = new Date('2026-11-09T12:00:00.000Z');

describe('applyAction', () => {
  it.each<ProspectStatus>(['READY', 'CONTACTED', 'CALLBACK'])(
    'из %s «Согласился» сразу публикует',
    (status) => {
      const result = applyAction(status, 'agree', now);
      expect(result).toEqual({
        ok: true,
        status: 'PUBLISHED',
        data: { agreedAt: now, publishedAt: now, callAt: null },
      });
    },
  );

  it.each<ProspectStatus>(['READY', 'CONTACTED', 'CALLBACK'])(
    'из %s «Напомнить» ставит CALLBACK с датой',
    (status) => {
      expect(applyAction(status, 'callback', now, tomorrow)).toEqual({
        ok: true,
        status: 'CALLBACK',
        data: { callAt: tomorrow },
      });
    },
  );

  it('«Напомнить» принимает сегодняшний московский день целиком', () => {
    expect(applyAction('READY', 'callback', now, lateToday).ok).toBe(true);
    expect(applyAction('READY', 'callback', now, earlyToday).ok).toBe(true);
  });

  it('«Напомнить» без даты или в прошлом — ошибка по-русски', () => {
    const missing = applyAction('READY', 'callback', now);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toMatch(/^Так отметить нельзя: укажите дату/);
    const past = applyAction('READY', 'callback', now, yesterday);
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.error).toMatch(/уже прошла/);
    const invalid = applyAction('READY', 'callback', now, new Date('nope'));
    expect(invalid.ok).toBe(false);
  });

  it.each<ProspectStatus>(['READY', 'CONTACTED', 'CALLBACK'])('из %s «Отказ»', (status) => {
    // К3: отказ фирмы в работе — её почта и номера больше ничего не получают (optOutAt).
    expect(applyAction(status, 'decline', now)).toEqual({
      ok: true,
      status: 'DECLINED',
      data: { declinedAt: now, optOutAt: now, callAt: null },
    });
  });

  it.each<ProspectStatus>(['READY', 'CONTACTED', 'CALLBACK'])(
    'из %s «Ответил» ставит отметку, статус тот же',
    (status) => {
      expect(applyAction(status, 'replied', now)).toEqual({
        ok: true,
        status,
        data: { repliedAt: now },
      });
    },
  );

  it.each<ProspectStatus>(['PUBLISHED', 'REGISTERED'])(
    'из %s можно только снять с публикации',
    (status) => {
      // Снятая страница — тоже «больше не писать»: адрес и номер идут в список отписанных.
      expect(applyAction(status, 'decline', now)).toEqual({
        ok: true,
        status: 'DECLINED',
        data: { declinedAt: now, optOutAt: now },
      });
      for (const action of ['agree', 'callback', 'replied'] as const) {
        const result = applyAction(status, action, now, tomorrow);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/^Так отметить нельзя:/);
      }
    },
  );

  it('из DECLINED можно только вернуть («Согласился»)', () => {
    expect(applyAction('DECLINED', 'agree', now)).toEqual({
      ok: true,
      status: 'PUBLISHED',
      data: { agreedAt: now, publishedAt: now },
    });
    for (const action of ['callback', 'decline', 'replied'] as const) {
      const result = applyAction('DECLINED', action, now, tomorrow);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/^Так отметить нельзя:/);
    }
  });

  it('заметка — всегда ок, статус не меняется', () => {
    for (const status of [
      'NEW',
      'READY',
      'CONTACTED',
      'CALLBACK',
      'AGREED',
      'PUBLISHED',
      'DECLINED',
      'REGISTERED',
    ] as const) {
      expect(applyAction(status, 'note', now)).toEqual({ ok: true, status, data: {} });
    }
  });

  it('промежуточные NEW и AGREED владелец не отмечает', () => {
    for (const status of ['NEW', 'AGREED'] as const) {
      const result = applyAction(status, 'agree', now);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/^Так отметить нельзя:/);
    }
  });

  it('тексты ошибок без слов «кабинет», «вкладка», «сайт», «приложение»', () => {
    const errors = [
      applyAction('PUBLISHED', 'agree', now),
      applyAction('DECLINED', 'decline', now),
      applyAction('READY', 'callback', now),
      applyAction('READY', 'callback', now, yesterday),
      applyAction('NEW', 'decline', now),
    ]
      .filter((r): r is { ok: false; error: string } => !r.ok)
      .map((r) => r.error.toLowerCase());
    expect(errors).toHaveLength(5);
    for (const text of errors) {
      expect(text).not.toMatch(/кабинет|вкладк|сайт|приложени/);
    }
  });
});

describe('applyAction — клиентский сайт (К10)', () => {
  it.each<ProspectStatus>(['READY', 'CONTACTED', 'CALLBACK'])(
    'из %s «Согласился» ставит AGREED и не публикует',
    (status) => {
      expect(applyAction(status, 'agree', now, undefined, 'site')).toEqual({
        ok: true,
        status: 'AGREED',
        data: { agreedAt: now, callAt: null },
      });
    },
  );

  it('«Опубликовать» переводит AGREED в PUBLISHED с датой публикации', () => {
    expect(applyAction('AGREED', 'publish', now, undefined, 'site')).toEqual({
      ok: true,
      status: 'PUBLISHED',
      data: { publishedAt: now },
    });
  });

  it('у AGREED можно «Отказ», остальное — нет', () => {
    expect(applyAction('AGREED', 'decline', now, undefined, 'site')).toEqual({
      ok: true,
      status: 'DECLINED',
      data: { declinedAt: now, optOutAt: now, callAt: null },
    });
    for (const action of ['agree', 'callback', 'replied'] as const) {
      const result = applyAction('AGREED', action, now, tomorrow, 'site');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/Опубликовать/);
    }
  });

  it.each<ProspectStatus>(['NEW', 'READY', 'CONTACTED', 'CALLBACK', 'PUBLISHED', 'DECLINED'])(
    '«Опубликовать» из %s нельзя',
    (status) => {
      expect(applyAction(status, 'publish', now, undefined, 'site').ok).toBe(false);
    },
  );

  it('после отказа «Согласился» возвращает сайт в AGREED, а не на публикацию', () => {
    expect(applyAction('DECLINED', 'agree', now, undefined, 'site')).toEqual({
      ok: true,
      status: 'AGREED',
      data: { agreedAt: now },
    });
  });

  it('опубликованный сайт можно снять', () => {
    expect(applyAction('PUBLISHED', 'decline', now, undefined, 'site')).toMatchObject({
      ok: true,
      status: 'DECLINED',
    });
  });

  it('подрядчик — как раньше: «Согласился» сразу публикует, «Опубликовать» не нужно', () => {
    expect(applyAction('READY', 'agree', now, undefined, 'provider')).toMatchObject({
      ok: true,
      status: 'PUBLISHED',
    });
    expect(applyAction('AGREED', 'publish', now, undefined, 'provider').ok).toBe(false);
    expect(applyAction('READY', 'publish', now).ok).toBe(false);
  });
});
