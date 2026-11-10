import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const officeTick = vi.fn();
vi.mock('@/lib/office/tick', () => ({ officeTick }));

const { GET } = await import('./route');

function call(query = '', auth = 'Bearer cron-test') {
  return GET(
    new NextRequest(`http://localhost/api/cron/office${query}`, {
      headers: { authorization: auth },
    }),
  );
}

describe('GET /api/cron/office', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'cron-test');
    officeTick.mockReset();
    officeTick.mockResolvedValue({ steps: [] });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('без секрета — 403, тик не запускается', async () => {
    expect((await call('', 'Bearer wrong')).status).toBe(403);
    expect((await call('', '')).status).toBe(403);
    expect(officeTick).not.toHaveBeenCalled();
  });

  it('?steps: от 0 до 3, по умолчанию и для не числа — 3', async () => {
    const cases: [string, number][] = [
      ['', 3],
      ['?steps=0', 0],
      ['?steps=2', 2],
      ['?steps=9', 3],
      ['?steps=-1', 0],
      ['?steps=abc', 3],
      ['?steps=', 3],
      ['?steps=1.5', 3],
    ];
    for (const [query, expected] of cases) {
      officeTick.mockClear();
      expect((await call(query)).status).toBe(200);
      expect(officeTick.mock.calls[0]![1]).toMatchObject({ maxSteps: expected });
    }
  });
});

describe('.github/scripts/office-relay.sh', () => {
  const script = path.resolve(process.cwd(), '../../.github/scripts/office-relay.sh');

  it('проходит проверку синтаксиса bash', () => {
    expect(() => execFileSync('bash', ['-n', script], { stdio: 'pipe' })).not.toThrow();
  });

  it('не печатает тела ответов: в них данные компаний', () => {
    const text = readFileSync(script, 'utf8');
    expect(text).not.toMatch(/\bcat\s/);
    expect(text).not.toMatch(/curl[^\n]*\s-v\b/);
    // Ответы пишутся в файлы, в журнал идут только числа из ответа ingest.
    expect(text).toContain('-o "$TMP/ingest.json"');
    expect(text).toContain('found=\\(.found) created=\\(.created) skipped=\\(.skipped)');
  });

  it('без CRON_SECRET выходит с ошибкой и никуда не ходит', () => {
    let status = 0;
    let out = '';
    try {
      execFileSync('bash', [script], { env: { ...process.env, CRON_SECRET: '' }, stdio: 'pipe' });
    } catch (error) {
      status = (error as { status: number }).status;
      out = String((error as { stdout: Buffer }).stdout);
    }
    expect(status).toBe(1);
    expect(out).toContain('::error::CRON_SECRET');
  });
});
