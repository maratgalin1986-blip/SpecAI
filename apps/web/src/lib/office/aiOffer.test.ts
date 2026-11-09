import { describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('@specai/ai-service', () => ({
  DEFAULT_MODEL: 'default-model',
  getAnthropicClient: () => ({ messages: { create } }),
}));

import {
  AI_OFFER_MAX_TOKENS,
  aiKeyConfigured,
  improveOffer,
  parseAiOffer,
  parseSentOffer,
  type AiAsk,
} from './aiOffer';
import type { Dossier } from './dossier';
import { buildOffer } from './offer';

const dossier: Dossier = {
  v: 1,
  niche: 'dentist',
  nicheTitle: 'Стоматология',
  city: 'Казань',
  facts: ['адрес: ул. Баумана, 10', 'часы: пн-пт 09:00-21:00', 'в карточке указан WhatsApp'],
  hours: { lateClose: '21:00', weekends: false, roundTheClock: false },
  competitors: { radiusKm: 2, sameNiche: 4, withSite: 3 },
  channels: { email: true, whatsapp: true, telegram: false },
  gaps: ['нет своего сайта'],
};
const offer = buildOffer({ dossier, angle: 'open_late', companyName: 'Улыбка' });
const env = { ANTHROPIC_API_KEY: 'key' };

const good = {
  opener: 'Вы принимаете пациентов до 21:00 — для тех, кто работает днём, это важно.',
  bullets: [
    'На первом экране — услуги, цены на лечение и как записаться.',
    'Часы «до 21:00» видно сразу, а заявку можно оставить и ночью.',
    'Кнопка WhatsApp: пациенту не нужно звонить.',
  ],
};
const answer = (data: unknown): AiAsk => vi.fn(async () => JSON.stringify(data));

describe('improveOffer', () => {
  it('rewrites the opener and the three bullets, keeps subject, angle and package', async () => {
    const ask = answer(good);
    const out = await improveOffer(offer, dossier, { ask, env });
    expect(out).toMatchObject({ ...good, subject: offer.subject, angle: 'open_late', ai: true });
    expect(out.packageKey).toBe(offer.packageKey);
    const req = vi.mocked(ask).mock.calls[0]![0];
    expect(req.maxTokens).toBe(AI_OFFER_MAX_TOKENS);
    expect(req.model).toBe('default-model');
    expect(req.timeoutMs).toBe(8000);
    expect(req.system).toMatch(/только JSON/);
    // Only the dossier and the draft go to the model.
    expect(JSON.parse(req.user)).toMatchObject({
      dossier: { niche: 'Стоматология', city: 'Казань' },
      draft: { opener: offer.opener, bullets: offer.bullets },
    });
  });

  it('the model can be overridden with OFFICE_AI_MODEL', async () => {
    const ask = answer(good);
    await improveOffer(offer, dossier, { ask, env: { ...env, OFFICE_AI_MODEL: ' other ' } });
    expect(vi.mocked(ask).mock.calls[0]![0].model).toBe('other');
  });

  it('without the key nothing is asked and the original offer goes out', async () => {
    const ask = answer(good);
    const out = await improveOffer(offer, dossier, { ask, env: {} });
    expect(ask).not.toHaveBeenCalled();
    expect(out).toEqual({ ...offer, ai: false });
    expect(aiKeyConfigured({})).toBe(false);
    expect(aiKeyConfigured({ ANTHROPIC_API_KEY: ' ' })).toBe(false);
    expect(aiKeyConfigured(env)).toBe(true);
  });

  it('any failure returns the original: error, timeout, not JSON', async () => {
    const failing: AiAsk = async () => {
      throw new Error('rate limit');
    };
    expect(await improveOffer(offer, dossier, { ask: failing, env })).toEqual({
      ...offer,
      ai: false,
    });
    const slow: AiAsk = () => new Promise(() => {});
    expect(await improveOffer(offer, dossier, { ask: slow, env, timeoutMs: 20 })).toMatchObject({
      ai: false,
    });
    const prose: AiAsk = async () => 'Вот ваше письмо: всё отлично';
    expect((await improveOffer(offer, dossier, { ask: prose, env })).ai).toBe(false);
  });

  it('by default asks through the shared client with the timeout and no retries', async () => {
    create.mockResolvedValueOnce({
      content: [{ type: 'text', text: `Ответ:\n${JSON.stringify(good)}` }],
    });
    const out = await improveOffer(offer, dossier, { env });
    expect(out.ai).toBe(true);
    const [body, options] = create.mock.calls[0]!;
    expect(body).toMatchObject({ model: 'default-model', max_tokens: 350 });
    expect(options).toEqual({ timeout: 8000, maxRetries: 0 });
  });
});

describe('parseAiOffer — checks', () => {
  const check = (data: unknown) => parseAiOffer(JSON.stringify(data), offer, dossier);

  it('accepts numbers and Latin words from the dossier or the draft', () => {
    expect(check(good)).toEqual(good);
    // Bullet markers and extra spaces are cleaned.
    expect(check({ ...good, bullets: good.bullets.map((b) => `-  ${b}`) })?.bullets).toEqual(
      good.bullets,
    );
  });

  it('rejects a number that is not in the dossier', () => {
    expect(
      check({ ...good, opener: 'Уже 15 лет вы принимаете пациентов в Казани до 21:00.' }),
    ).toBeNull();
    expect(
      check({
        ...good,
        bullets: [good.bullets[0], good.bullets[1], 'Приведём 100 клиентов в месяц.'],
      }),
    ).toBeNull();
  });

  it('rejects forbidden words, links, mail and new Latin words (names, models)', () => {
    for (const opener of [
      'Вы лучшая стоматология в районе Казани, и это видно.',
      'Гарантируем приток пациентов уже в первый месяц работы.',
      'Самая удобная клиника рядом с метро в Казани.',
      'Смотрите пример на https://example.ru — так будет и у вас.',
      'Пишите нам на office@example.ru, ответим быстро и подробно.',
      'Текст подготовил Assistant по данным вашей карточки.',
      'Отличная новость для вашей клиники в Казани!',
    ]) {
      expect(check({ ...good, opener }), opener).toBeNull();
    }
  });

  it('rejects wrong shapes and lengths', () => {
    expect(check({ opener: good.opener, bullets: good.bullets.slice(0, 2) })).toBeNull();
    expect(check({ opener: 'Коротко.', bullets: good.bullets })).toBeNull();
    expect(check({ opener: 'я'.repeat(400), bullets: good.bullets })).toBeNull();
    expect(check({ opener: good.opener, bullets: [1, 2, 3] })).toBeNull();
    expect(parseAiOffer('[]', offer, dossier)).toBeNull();
    expect(parseAiOffer('{ broken', offer, dossier)).toBeNull();
  });
});

describe('parseSentOffer', () => {
  it('reads what the outreach stored, rejects broken JSON and unknown angles', () => {
    expect(parseSentOffer(JSON.stringify({ ...offer, ai: true }))).toEqual({ ...offer, ai: true });
    expect(parseSentOffer(JSON.stringify(offer))).toEqual({ ...offer, ai: false });
    expect(parseSentOffer(JSON.stringify({ ...offer, angle: 'magic' }))).toBeNull();
    expect(parseSentOffer('{')).toBeNull();
    expect(parseSentOffer(null)).toBeNull();
  });
});
