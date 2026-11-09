import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/database', () => ({ prisma: {} }));

import {
  DIGEST_HOURS,
  DIGEST_LIST_LIMIT,
  buildDigest,
  moscowHour,
  type DigestInput,
  type ProspectLite,
} from './digest';

const SITE = 'https://xn--24-6kc5aagh4arjl.xn--p1ai';

function lite(i: number, over: Partial<ProspectLite> = {}): ProspectLite {
  return {
    name: `Компания ${i}`,
    city: 'Казань',
    niche: 'dentist',
    phone: `+7843200${String(i).padStart(4, '0')}`,
    token: `${'0'.repeat(28)}${String(i).padStart(4, '0')}`,
    kind: 'site',
    ...over,
  };
}

function input(over: Partial<DigestInput> = {}): DigestInput {
  return {
    date: new Date('2026-11-09T06:30:00Z'),
    runs: [],
    toContact: [],
    contacted: { email: 0, whatsapp: 0 },
    replied: [],
    callbacks: [],
    registered: 0,
    siteUrl: SITE,
    paused: false,
    outreachPaused: false,
    nextStep: 'providers; machinery; Казань',
    ...over,
  };
}

describe('buildDigest', () => {
  it('пустая ночь → одна короткая строка со следующим шагом и ссылкой на офис', () => {
    const text = buildDigest(input());
    expect(text.split('\n')).toHaveLength(1);
    expect(text).toContain('за ночь новых кандидатов нет');
    expect(text).toContain('следующий шаг — providers; machinery; Казань');
    expect(text).toContain(`${SITE}/admin/office`);
  });

  it('пустая ночь на паузе → «план на паузе»', () => {
    const text = buildDigest(input({ paused: true }));
    expect(text).toContain('план на паузе');
    expect(text).not.toContain('следующий шаг');
  });

  it('пустая ночь, но источник не отвечал → это видно', () => {
    const text = buildDigest(
      input({
        runs: [
          { agent: 'sites', niche: 'dentist', city: 'Казань', found: 0, created: 0, error: 'нет' },
        ],
      }),
    );
    expect(text).toContain('источник карт не отвечал (1)');
  });

  it('полная сводка: итоги агентов, списки со ссылками превью, дата по Москве', () => {
    const text = buildDigest(
      input({
        runs: [
          {
            agent: 'providers',
            niche: 'machinery',
            city: 'Уфа',
            found: 7,
            created: 4,
            error: null,
          },
          {
            agent: 'providers',
            niche: 'machinery',
            city: 'Пермь',
            found: 5,
            created: 3,
            error: null,
          },
          { agent: 'sites', niche: 'dentist', city: 'Казань', found: 2, created: 1, error: 'x' },
        ],
        toContact: [lite(1), lite(2, { kind: 'provider', niche: 'machinery', city: 'Уфа' })],
        contacted: { email: 3, whatsapp: 1 },
        replied: [lite(3)],
        callbacks: [lite(4)],
        registered: 2,
      }),
    );
    expect(text).toContain('Офис за сутки (09.11):');
    expect(text).toContain(
      'Подрядчики — найдено 12, страниц 7; Сайты под ключ — найдено 2, страниц 1',
    );
    expect(text).toContain('источник карт не отвечал: 1 шаг');
    expect(text).toContain('Отправлено: писем 3, WhatsApp 1.');
    expect(text).toContain('Ответили (1):');
    expect(text).toContain('Готовы к отправке (2):');
    expect(text).toContain('Напомнить сегодня (1):');
    expect(text).toContain(
      `1. Компания 1 · Казань · Стоматология · +7 843 200-00-01 · превью: ${SITE}/preview/${lite(1).token}`,
    );
    expect(text).toContain('Уфа · Спецтехника');
    expect(text).toContain('Зарегистрировались по ссылке: 2');
    expect(text.trim().endsWith(`Открыть офис: ${SITE}/admin/office`)).toBe(true);
    expect(text).not.toMatch(/на паузе/);
  });

  it('режет список до 10 и пишет «и ещё N»', () => {
    const many = Array.from({ length: 14 }, (_, i) => lite(i + 1));
    const text = buildDigest(input({ toContact: many }));
    const lines = text.split('\n');
    expect(lines.filter((l) => /^\d+\. /.test(l))).toHaveLength(DIGEST_LIST_LIMIT);
    expect(text).toContain('и ещё 4 в админке');
    expect(text).not.toContain('Компания 11 ·');
  });

  it('паузы поиска и рассылки помечаются', () => {
    const text = buildDigest(input({ toContact: [lite(1)], paused: true, outreachPaused: true }));
    expect(text).toContain('Поиск на паузе.');
    expect(text).toContain('Рассылка на паузе.');
  });

  it('убирает завершающий слэш адреса', () => {
    const text = buildDigest(input({ siteUrl: `${SITE}/`, toContact: [lite(1)] }));
    expect(text).toContain(`${SITE}/preview/`);
    expect(text).not.toContain('//preview');
  });
});

describe('moscowHour', () => {
  it('переводит в московское время', () => {
    expect(moscowHour(new Date('2026-11-09T06:30:00Z'))).toBe(9);
    expect(moscowHour(new Date('2026-11-09T21:05:00Z'))).toBe(0);
    expect(DIGEST_HOURS).toEqual({ from: 8, to: 23 });
  });
});
