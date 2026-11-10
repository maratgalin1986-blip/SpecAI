// ИИ-аналитик персонального предложения (U2): по досье фирмы переписывает вступление и три
// пункта письма живым русским языком. Факты — только из досье и исходного предложения: ответ
// с новой цифрой, новым латинским словом, ссылкой или запрещённым словом («лучший»,
// «гарантируем» — ФЗ «О рекламе», ст. 5) отбрасывается. Любой сбой (нет ключа, таймаут,
// не JSON, проверка не прошла) — письмо уходит с исходным предложением, без ИИ.

import { isSampleSource } from './dossier';
import { DEFAULT_MODEL, getAnthropicClient } from '@specai/ai-service';
import type { Dossier } from './dossier';
import { OFFER_ANGLES, type Offer } from './offer';

/** Предложение, как оно ушло: `ai` — вступление и пункты переписал ИИ-аналитик. */
export type SentOffer = Offer & { ai: boolean };

/** Ответ ИИ не дольше этого, мс — крону рассылки нужно успеть отправить письма. */
export const AI_OFFER_TIMEOUT_MS = 8_000;
export const AI_OFFER_MAX_TOKENS = 350;

const OPENER_MIN = 20;
const OPENER_MAX = 320;
const BULLET_MIN = 10;
const BULLET_MAX = 220;

export const AI_OFFER_SYSTEM_PROMPT = [
  'Ты помогаешь написать короткое деловое письмо небольшой компании, у которой нет своего сайта.',
  'Тебе дают досье компании (факты из её открытой карточки на карте) и черновик: вступление и три пункта.',
  'Перепиши вступление (одно-два предложения) и три пункта живым, простым русским языком, на «вы».',
  'Опирайся только на факты досье и черновика. Не добавляй цифр, которых нет в досье или черновике.',
  'Не пиши «лучший», «самый», «гарантируем», «номер один», не давай обещаний результата.',
  'Без ссылок, телефонов, почты, эмодзи и восклицательных знаков. Не упоминай ИИ.',
  'Ответь только JSON без пояснений: {"opener": "…", "bullets": ["…", "…", "…"]}.',
].join('\n');

/** Запрос к модели — подменяется в тестах. Возвращает текст ответа. */
export type AiAsk = (request: {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
}) => Promise<string>;

export interface AiOfferDeps {
  ask?: AiAsk;
  /** Окружение (по умолчанию process.env): ключ и модель. */
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

/** Ключ ИИ задан на сервере — для админки только «есть/нет», без значения. */
export function aiKeyConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

const askAnthropic: AiAsk = async ({ model, system, user, maxTokens, timeoutMs }) => {
  const message = await getAnthropicClient().messages.create(
    { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] },
    { timeout: timeoutMs, maxRetries: 0 },
  );
  return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const FORBIDDEN_RE =
  /лучш|(?<![а-яё])сам(?:ый|ая|ое|ые|ых|ого|ому|ой)(?![а-яё])|гарантир|номер\s*один|№\s*1|идеальн|уникальн|бесплатн|https?:|www\.|@|!/i;

const numbersOf = (text: string): string[] => text.match(/\d+/g) ?? [];
const latinWordsOf = (text: string): string[] =>
  (text.match(/[a-z]+/gi) ?? []).map((w) => w.toLowerCase());

/** Текст, из которого ИИ может брать факты: досье и исходное предложение. */
function sourceText(offer: Offer, dossier: Dossier | null): string {
  return [
    offer.subject,
    offer.opener,
    ...offer.bullets,
    dossier ? JSON.stringify(dossier) : '',
  ].join('\n');
}

/**
 * Проверка ответа ИИ: JSON `{ opener, bullets[3] }`, длины в рамках, нет цифр и латинских слов,
 * которых нет в досье и черновике (так в письмо не попадут выдуманные числа и чужие имена), нет
 * запрещённых слов, ссылок и почты. Не прошёл — null.
 */
export function parseAiOffer(
  raw: string,
  offer: Offer,
  dossier: Dossier | null,
): { opener: string; bullets: string[] } | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { opener, bullets } = data as { opener?: unknown; bullets?: unknown };
  if (typeof opener !== 'string' || !Array.isArray(bullets) || bullets.length !== 3) return null;
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  const out = { opener: clean(opener), bullets: [] as string[] };
  if (out.opener.length < OPENER_MIN || out.opener.length > OPENER_MAX) return null;
  for (const b of bullets) {
    if (typeof b !== 'string') return null;
    const text = clean(b).replace(/^[-–—•*]\s*/, '');
    if (text.length < BULLET_MIN || text.length > BULLET_MAX) return null;
    out.bullets.push(text);
  }
  const all = [out.opener, ...out.bullets].join('\n');
  if (FORBIDDEN_RE.test(all)) return null;
  const source = sourceText(offer, dossier);
  const numbers = new Set(numbersOf(source));
  if (numbersOf(all).some((n) => !numbers.has(n))) return null;
  const words = new Set(latinWordsOf(source));
  if (latinWordsOf(all).some((w) => !words.has(w))) return null;
  return out;
}

/** Что уходит модели: досье (без телефона и почты — их в досье нет) и черновик. */
function userMessage(offer: Offer, dossier: Dossier | null): string {
  return JSON.stringify({
    dossier: dossier
      ? {
          niche: dossier.nicheTitle,
          city: dossier.city,
          facts: dossier.facts,
          gaps: dossier.gaps,
          competitors: dossier.competitors,
        }
      : null,
    draft: { opener: offer.opener, bullets: offer.bullets },
  });
}

/**
 * Предложение, улучшенное ИИ-аналитиком, или исходное (`ai: false`), если ключа нет или
 * что-то пошло не так. Тема, заход и пакет не меняются — только вступление и пункты.
 */
export async function improveOffer(
  offer: Offer,
  dossier: Dossier | null,
  deps: AiOfferDeps = {},
): Promise<SentOffer> {
  const original: SentOffer = { ...offer, bullets: [...offer.bullets], ai: false };
  const env = deps.env ?? process.env;
  if (!aiKeyConfigured(env)) return original;
  const ask = deps.ask ?? askAnthropic;
  const timeoutMs = deps.timeoutMs ?? AI_OFFER_TIMEOUT_MS;
  try {
    const raw = await withTimeout(
      ask({
        model: env.OFFICE_AI_MODEL?.trim() || DEFAULT_MODEL,
        system: AI_OFFER_SYSTEM_PROMPT,
        user: userMessage(offer, dossier),
        maxTokens: AI_OFFER_MAX_TOKENS,
        timeoutMs,
      }),
      timeoutMs,
    );
    const parsed = parseAiOffer(raw, offer, dossier);
    if (!parsed) return original;
    return { ...offer, opener: parsed.opener, bullets: parsed.bullets, ai: true };
  } catch {
    return original;
  }
}

/** Предложение из `offerJson` (как ушло); битое — null. */
export function parseSentOffer(raw: string | null | undefined): SentOffer | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<SentOffer>;
    if (
      typeof o?.angle !== 'string' ||
      !(OFFER_ANGLES as readonly string[]).includes(o.angle) ||
      typeof o.subject !== 'string' ||
      typeof o.opener !== 'string' ||
      !Array.isArray(o.bullets) ||
      !o.bullets.every((b) => typeof b === 'string') ||
      (o.packageKey !== 'vizitka' && o.packageKey !== 'domen')
    ) {
      return null;
    }
    return { ...(o as Offer), ai: o.ai === true };
  } catch {
    return null;
  }
}

/** Заходы, в тексте которых стоят числа соседей («у 1 из 3 уже есть сайт», «ни у одной нет»). */
const NEIGHBOUR_ANGLES: readonly string[] = ['competitors_have_sites', 'first_in_area'];

/**
 * Записанное предложение, которое можно показать и отправить. Если фирме ещё не писали, её
 * досье собрано по неполному списку (isSampleSource), а заход — про соседей, записанный текст
 * не годится: его числа могут быть неверны. Тогда null — предложение строится заново, уже без
 * чисел соседей. Отправленное предложение остаётся как было: это история.
 */
export function storedOfferOf(row: {
  offerJson: string | null;
  source?: string | null;
  emailSentAt?: Date | null;
  whatsappSentAt?: Date | null;
}): SentOffer | null {
  const offer = parseSentOffer(row.offerJson);
  if (!offer) return null;
  const unsent = !row.emailSentAt && !row.whatsappSentAt;
  if (unsent && isSampleSource(row.source) && NEIGHBOUR_ANGLES.includes(offer.angle)) return null;
  return offer;
}
