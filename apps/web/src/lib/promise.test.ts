import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PROMISE_POINTS } from './promise';
import { SITE } from './site';

// Owner, 2026-10-17: «бесплатно и без посредников» always in view, quietly.
const NO_SUPERLATIVES = /лучш|самы[ейх]|дешевл|гарант/i;

describe('the promise explanation (/kak-polzovatsya#besplatno)', () => {
  it('says who sets the price, how payment goes, what the platform takes and how СпецПласт16 earns', () => {
    expect(PROMISE_POINTS.length).toBeGreaterThanOrEqual(3);
    expect(PROMISE_POINTS.length).toBeLessThanOrEqual(4);
    const all = PROMISE_POINTS.join(' ');
    expect(all).toContain('Цену назначает');
    expect(all).toContain('напрямую');
    expect(all).toContain('не берёт процент');
    expect(all).toContain(SITE.name);
    expect(all).not.toMatch(NO_SUPERLATIVES);
  });
});

describe('SITE.promiseLine (PromiseNote, the footer, the channel post, the bot)', () => {
  it('is the headline, a colon and the detail starting in lower case', () => {
    expect(SITE.promiseLine.startsWith(`${SITE.promise}: `)).toBe(true);
    expect(SITE.promiseLine).toBe(
      'Бесплатно и без посредников: цену назначает владелец техники, расчёт — напрямую с ним, ' +
        'площадка не берёт процент.',
    );
  });
});

function component(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../components/${name}.tsx`, import.meta.url)), 'utf8');
}

describe('where the promise is shown', () => {
  it('the header shows the short promise under the logo, linked to the explanation', () => {
    const source = component('SiteHeader');
    expect(source).toContain('{SITE.promiseShort}');
    expect(source).toContain('href={SITE.promiseHref}');
  });

  it('the note links the headline to the explanation and adds the detail', () => {
    const source = component('PromiseNote');
    expect(source).toContain('href={SITE.promiseHref}');
    expect(source).toContain('{SITE.promise}');
    expect(source).toContain('SITE.promiseLine.slice(SITE.promise.length)');
  });

  it('every order and sign-up form carries the note next to its submit button', () => {
    for (const name of [
      'NewOrderForm',
      'GuestOrderForm',
      'CallbackForm',
      'QuickOrder',
      'CabinetQuickOrder',
      'BecomeProviderForm',
      'SiteFooter',
    ]) {
      expect(component(name), name).toContain('<PromiseNote');
    }
  });
});
