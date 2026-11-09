import { describe, expect, it, vi } from 'vitest';
import {
  optOutByToken,
  optedOutEmails,
  unsubscribeConfigured,
  unsubscribeHeaders,
  unsubscribeLinks,
  unsubscribeSignature,
  verifyUnsubscribe,
  type OptOutDb,
  type OptedOutDb,
} from './unsubscribe';

const ENV = { CRON_SECRET: 'cron-secret' };
const TOKEN = '0123456789abcdef0123456789abcdef';
const NOW = new Date('2026-11-10T09:00:00Z');

describe('подпись ссылки отписки', () => {
  it('без секрета ссылок нет', () => {
    expect(unsubscribeConfigured({})).toBe(false);
    expect(unsubscribeLinks('https://x.ru', TOKEN, {})).toBeNull();
  });

  it('NEXTAUTH_SECRET подходит, если нет CRON_SECRET', () => {
    expect(unsubscribeConfigured({ NEXTAUTH_SECRET: 'a' })).toBe(true);
    expect(unsubscribeSignature(TOKEN, { NEXTAUTH_SECRET: 'a' })).toBeTruthy();
  });

  it('верная подпись проходит, чужая и подделанная — нет', () => {
    const s = unsubscribeSignature(TOKEN, ENV)!;
    expect(verifyUnsubscribe(TOKEN, s, ENV)).toBe(true);
    expect(verifyUnsubscribe(TOKEN, s, { CRON_SECRET: 'other' })).toBe(false);
    expect(verifyUnsubscribe(`${TOKEN.slice(0, -1)}0`, s, ENV)).toBe(false);
    expect(verifyUnsubscribe(TOKEN, `${s}x`, ENV)).toBe(false);
    expect(verifyUnsubscribe(TOKEN, undefined, ENV)).toBe(false);
    expect(verifyUnsubscribe('../../x', s, ENV)).toBe(false);
  });

  it('ссылки: страница /otpiska и адрес в один клик, заголовки RFC 8058', () => {
    const links = unsubscribeLinks('https://x.ru/', TOKEN, ENV)!;
    const s = encodeURIComponent(unsubscribeSignature(TOKEN, ENV)!);
    expect(links.page).toBe(`https://x.ru/otpiska/${TOKEN}?s=${s}`);
    expect(links.oneClick).toBe(`https://x.ru/api/office/unsubscribe?t=${TOKEN}&s=${s}`);
    expect(unsubscribeHeaders(links)).toEqual({
      'List-Unsubscribe': `<${links.oneClick}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});

function optOutDb(row: { id: string; status: string; optOutAt: Date | null } | null) {
  const update = vi.fn(async () => ({}));
  const db: OptOutDb = { prospect: { findUnique: async () => row, update } };
  return { db, update };
}

describe('optOutByToken', () => {
  it('кандидат в воронке: optOutAt, DECLINED, declinedAt', async () => {
    const { db, update } = optOutDb({ id: 'p1', status: 'CONTACTED', optOutAt: null });
    expect(await optOutByToken(TOKEN, NOW, db)).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { optOutAt: NOW, status: 'DECLINED', declinedAt: NOW },
    });
  });

  it('клиент (PUBLISHED) остаётся клиентом, но писем больше не получит', async () => {
    const { db, update } = optOutDb({ id: 'p1', status: 'PUBLISHED', optOutAt: null });
    await optOutByToken(TOKEN, NOW, db);
    expect(update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { optOutAt: NOW } });
  });

  it('повторная отписка — успех без записи', async () => {
    const { db, update } = optOutDb({ id: 'p1', status: 'DECLINED', optOutAt: NOW });
    expect(await optOutByToken(TOKEN, NOW, db)).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('нет такого кандидата — false', async () => {
    const { db } = optOutDb(null);
    expect(await optOutByToken(TOKEN, NOW, db)).toBe(false);
  });
});

describe('optedOutEmails', () => {
  it('ищет без учёта регистра и возвращает адреса в нижнем регистре', async () => {
    const findMany = vi.fn<OptedOutDb['prospect']['findMany']>(async () => [
      { email: 'Firm@Example.ru' },
    ]);
    const set = await optedOutEmails([' FIRM@example.ru ', null, 'other@x.ru'], {
      prospect: { findMany },
    });
    expect(set).toEqual(new Set(['firm@example.ru']));
    const args = findMany.mock.calls[0]![0];
    expect(args.where.email).toEqual({
      in: ['firm@example.ru', 'other@x.ru'],
      mode: 'insensitive',
    });
    expect(args.take).toBeGreaterThan(0);
  });

  it('пустой список — без запроса', async () => {
    const findMany = vi.fn();
    expect(await optedOutEmails([null, ''], { prospect: { findMany } })).toEqual(new Set());
    expect(findMany).not.toHaveBeenCalled();
  });
});
