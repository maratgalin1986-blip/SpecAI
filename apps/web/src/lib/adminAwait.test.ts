import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Next.js 15 сделал isAdminRequest() и adminGate() асинхронными. Вызов без await — это
// Promise, он всегда «истина»: `if (!isAdminRequest())` никогда не отвечает 401, и
// админский маршрут открыт всем (так было с маршрутами офиса 2026-11-09). tsc и eslint
// этого не ловят, поэтому — проверка исходников.

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : files(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

const CALL = /\b(isAdminRequest|adminGate)\(\)/g;

describe('isAdminRequest и adminGate всегда с await', () => {
  it('нет ни одного вызова без await', () => {
    const offenders: string[] = [];
    for (const file of files(join(__dirname, '..'))) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line) || /function (isAdminRequest|adminGate)\(/.test(line))
          return;
        for (const m of line.matchAll(CALL)) {
          const before = line.slice(0, m.index);
          if (!/await\s*$/.test(before) && !/await\s+\($/.test(before))
            offenders.push(`${file}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
