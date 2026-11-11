import { describe, expect, it } from 'vitest';
import { PROCESSORS } from './processors';

// /privacy and /soglasie print this list. Since 2026-10-28 production runs on a
// Neon database created through Vercel (USA): the texts must not say «Россия».
describe('PROCESSORS', () => {
  it('names the real database and its country', () => {
    const database = PROCESSORS.find((p) => p.purpose.startsWith('база данных сайта'));
    expect(database?.name).toContain('Neon');
    expect(database?.country).toBe('США');
  });

  it('does not claim a database in Yandex Cloud', () => {
    expect(PROCESSORS.some((p) => /yandex cloud/i.test(p.name))).toBe(false);
  });
});
