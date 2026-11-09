import { PLATFORM_PROMISE, PLATFORM_PROMISE_DETAIL } from '@specai/shared';
import { describe, expect, it } from 'vitest';
import type { PageProspect } from './pageTypes';
import { buildCallScript, rubles } from './scripts';

const PREVIEW = 'https://иистройка24.рф/preview/abc123';

const site: PageProspect = {
  kind: 'site',
  status: 'NEW',
  slug: 'ulybka-kazan',
  name: 'Стоматология «Улыбка»',
  phone: '+7 (927) 123-45-67',
  address: 'Казань, ул. Баумана, 1',
  city: 'Казань',
  lat: null,
  lon: null,
  tags: null,
  hours: null,
};

const provider: PageProspect = {
  ...site,
  kind: 'provider',
  slug: 'tehno-chelny',
  name: 'ООО «ТехноЧелны»',
  city: 'Набережные Челны',
  tags: 'ekskavator',
};

const input = {
  previewUrl: PREVIEW,
  prices: { setup: 15000, monthly: 1500 },
  nicheTitle: 'Стоматология',
};

/** All human text of a script, with links taken out. */
function spoken(script: ReturnType<typeof buildCallScript>): string {
  return [script.title, ...script.steps.flatMap((s) => [s.heading, s.text])]
    .join('\n')
    .replace(/https?:\/\/\S+/g, '');
}

describe('rubles', () => {
  it('formats with a no-break space and the ruble sign', () => {
    expect(rubles(15000)).toBe('15\u00a0000\u00a0₽');
    expect(rubles(1500)).toBe('1\u00a0500\u00a0₽');
  });
});

describe('buildCallScript for a site prospect', () => {
  const script = buildCallScript(site, input);
  const text = spoken(script);

  it('has the steps of the template', () => {
    expect(script.steps.map((s) => s.heading)).toEqual([
      'Приветствие',
      'Зачем звоню',
      'Что на странице',
      'Предложение',
      'Если «дорого»',
      'Если «подумаю»',
      'Итог',
    ]);
  });

  it('names the company, the city and the preview link', () => {
    expect(text).toContain('Стоматология «Улыбка»');
    expect(text).toContain('в городе Казань');
    expect(script.steps[1]?.text).toContain(PREVIEW);
  });

  it('takes both prices from the argument, formatted in rubles', () => {
    const offer = script.steps.find((s) => s.heading === 'Предложение')!.text;
    expect(offer).toContain('15\u00a0000\u00a0₽');
    expect(offer).toContain('1\u00a0500\u00a0₽');
    const other = buildCallScript(site, { ...input, prices: { setup: 20000, monthly: 2000 } });
    const otherOffer = other.steps.find((s) => s.heading === 'Предложение')!.text;
    expect(otherOffer).toContain('20\u00a0000\u00a0₽');
    expect(otherOffer).not.toContain('15\u00a0000');
  });

  it('offers a callback date when the company wants to think', () => {
    expect(script.steps.find((s) => s.heading === 'Если «подумаю»')!.text).toMatch(/перезвон/i);
  });
});

describe('buildCallScript for a provider prospect', () => {
  const script = buildCallScript(provider, input);
  const text = spoken(script);

  it('has the steps of the template', () => {
    expect(script.steps.map((s) => s.heading)).toEqual([
      'Приветствие',
      'Зачем звоню',
      'Что на странице',
      'Как встать на линию',
      'Если «нам не надо»',
      'Итог',
    ]);
  });

  it('carries the shared promise, all of Russia and the preview link', () => {
    const why = script.steps[1]?.text ?? '';
    expect(why).toContain(PLATFORM_PROMISE);
    expect(why.toLowerCase()).toContain(PLATFORM_PROMISE_DETAIL.toLowerCase());
    expect(why).toContain('по всей России');
    expect(why).toContain(PREVIEW);
    expect(text).toContain('ООО «ТехноЧелны»');
  });

  it('puts no pressure and promises nothing extra', () => {
    expect(script.steps.find((s) => s.heading === 'Если «нам не надо»')!.text).toContain(
      'ничего не публикуем',
    );
    expect(text).not.toContain('Татарстан');
  });
});

describe('both scripts: language and claims', () => {
  const siteText = spoken(buildCallScript(site, input));
  const providerText = spoken(buildCallScript(provider, input));
  const texts = [siteText, providerText];

  it('is Russian without stray English words', () => {
    for (const text of texts) {
      expect(text).not.toMatch(/\b(site|landing|web|page|call|script)\b/i);
      // Brand names are the only Latin allowed.
      const latin = text.match(/[A-Za-z]+/g) ?? [];
      expect(latin.filter((w) => w !== 'WhatsApp')).toEqual([]);
    }
  });

  it('makes no advertising claims the law forbids and names no AI model', () => {
    for (const text of texts) {
      expect(text).not.toMatch(/лучш|самые низкие|гарантиру/i);
      expect(text).not.toMatch(/GPT|Claude|Gemini|Llama/i);
      // The owner introduces himself: no first name is baked in.
      expect(text).not.toMatch(/меня зовут|это Марат/i);
    }
  });

  it('contains no numbers but the prices (brand names aside)', () => {
    const brands = /СпецПласт16|ИИСтройка24/g;
    const noPrices = siteText.replace(brands, '').replace(/15\u00a0000|1\u00a0500/g, '');
    expect(noPrices).not.toMatch(/\d/);
    expect(providerText.replace(brands, '')).not.toMatch(/\d/);
  });
});
