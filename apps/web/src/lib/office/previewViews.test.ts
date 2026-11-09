import { describe, expect, it, vi } from 'vitest';
import {
  isBotAgent,
  previewViewsLabel,
  recordPreviewView,
  type PreviewViewsDb,
} from './previewViews';

const TOKEN = 'a'.repeat(32);
const NOW = new Date('2026-11-09T10:00:00Z');
const PHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function fakeDb(fail = false) {
  const calls: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
  const db: PreviewViewsDb = {
    prospect: {
      updateMany: vi.fn(async (args) => {
        calls.push(args);
        if (fail) throw new Error('db down');
        return { count: 1 };
      }),
    },
  };
  return { db, calls };
}

describe('isBotAgent', () => {
  it('браузеры людей — не боты', () => {
    expect(isBotAgent(PHONE)).toBe(false);
    expect(
      isBotAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 YaBrowser/24.10 Safari/537.36',
      ),
    ).toBe(false);
  });

  it('поисковики, превью ссылок в мессенджерах и пустой User-Agent — боты', () => {
    for (const ua of [
      'TelegramBot (like TwitterBot)',
      'WhatsApp/2.23.20.0',
      'facebookexternalhit/1.1',
      'vkShare; +http://vk.com/dev/Share',
      'Mozilla/5.0 (compatible; YandexBot/3.0)',
      'Mozilla/5.0 (compatible; Googlebot/2.1)',
      'Mozilla/5.0 (compatible; YandexMessenger/1.0) Preview',
      'SomeCrawler/1.0',
      'Spider',
      '',
      null,
      undefined,
    ]) {
      expect(isBotAgent(ua)).toBe(true);
    }
  });
});

describe('recordPreviewView', () => {
  it('человек: +1 к просмотрам и время первого просмотра, только если его не было', async () => {
    const { db, calls } = fakeDb();
    const counted = await recordPreviewView(db, TOKEN, { isAdmin: false, userAgent: PHONE }, NOW);
    expect(counted).toBe(true);
    expect(calls).toEqual([
      {
        where: { token: TOKEN },
        data: { previewViews: { increment: 1 }, previewLastViewedAt: NOW },
      },
      { where: { token: TOKEN, previewViewedAt: null }, data: { previewViewedAt: NOW } },
    ]);
  });

  it('админ и бот не считаются', async () => {
    const { db, calls } = fakeDb();
    expect(await recordPreviewView(db, TOKEN, { isAdmin: true, userAgent: PHONE }, NOW)).toBe(
      false,
    );
    expect(
      await recordPreviewView(db, TOKEN, { isAdmin: false, userAgent: 'TelegramBot' }, NOW),
    ).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('ошибка базы не пробрасывается', async () => {
    const { db } = fakeDb(true);
    await expect(
      recordPreviewView(db, TOKEN, { isAdmin: false, userAgent: PHONE }, NOW),
    ).resolves.toBe(false);
  });
});

describe('previewViewsLabel', () => {
  it('значок только для открывших', () => {
    expect(previewViewsLabel(3)).toBe('открыл превью ×3');
    expect(previewViewsLabel(0)).toBeNull();
    expect(previewViewsLabel(null)).toBeNull();
  });
});

describe('isBotAgent: служебные клиенты и проверки ссылок в почте — не люди', () => {
  it('curl, python, headless-браузер, сканеры ссылок', () => {
    for (const ua of [
      'curl/8.5.0',
      'python-requests/2.31',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36',
      'Mozilla/5.0 (compatible; Mail.RU_Bot/2.0)',
      'UptimeRobot/2.0',
    ]) {
      expect(isBotAgent(ua)).toBe(true);
    }
    expect(
      isBotAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false);
  });
});
