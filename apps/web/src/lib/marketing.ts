import { SITE } from './site';

// Marketing attribution: where a visitor came from (ad campaign, search,
// maps, messenger…) is remembered for 30 days and attached to every lead, so
// the admin panel can show which channel brings requests. Goals are also sent
// to Yandex.Metrika when its counter is configured.
//
// Model: "last significant touch", like Metrika's default — a visit with a
// UTM tag, an ad click id or an outside referrer replaces the stored channel;
// a direct visit (typed address, bookmark) keeps it.

const STORAGE_KEY = 'sp16_channel';
const TTL_MS = 30 * 86_400_000;
/** Fallback when nothing is known. */
export const DIRECT = 'Прямой заход';

const REFERRERS: [RegExp, string][] = [
  [/(^|\.)yandex\.|(^|\.)ya\.ru$/, 'Яндекс поиск'],
  [/(^|\.)google\./, 'Google поиск'],
  [/(^|\.)2gis\./, '2ГИС'],
  [/(^|\.)avito\.ru$/, 'Авито'],
  [/(^|\.)(vk\.com|vk\.ru)$/, 'ВКонтакте'],
  [/(^|\.)(t\.me|telegram\.org)$/, 'Telegram'],
  [/(^|\.)(wa\.me|whatsapp\.com)$/, 'WhatsApp'],
  [/(^|\.)(mail\.ru)$/, 'Mail.ru'],
  [/(^|\.)(dzen\.ru)$/, 'Дзен'],
];

/**
 * The channel of one visit, or null for a direct visit. `url` is the landing
 * page address, `referrer` is document.referrer, `ownHost` is this site.
 */
export function channelFrom(url: string, referrer: string, ownHost: string): string | null {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    params = new URLSearchParams();
  }
  const utm = ['utm_source', 'utm_medium', 'utm_campaign']
    .map((key) => params.get(key)?.trim().slice(0, 30))
    .filter(Boolean);
  if (utm.length) return utm.join('/');
  if (params.has('yclid')) return 'Яндекс Директ';
  if (params.has('gclid')) return 'Google Ads';
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  if (!host || host === ownHost.replace(/^www\./, '')) return null;
  for (const [pattern, label] of REFERRERS) if (pattern.test(host)) return label;
  return host.slice(0, 40);
}

/** "form · channel", within the 100 characters the lead API accepts. */
export function withChannel(source: string, channel: string) {
  return `${source} · ${channel}`.slice(0, 100);
}

const FORM_LABELS: Record<string, string> = {
  home: 'Главная, форма звонка',
  wizard: 'Подбор техники',
  estimate: 'Расчёт на странице техники',
  calculator: 'Калькулятор аренды',
  'catalog-card': 'Заказ из каталога',
  'catalog-empty': 'Каталог, ничего не нашли',
  landing: 'Страница вида техники',
  contacts: 'Контакты',
  provider: 'Поставщикам',
};

/** A readable name of the form a lead came from ("estimate:<id>" → its kind). */
export function formLabel(form: string) {
  const kind = form.split(':')[0] ?? '';
  return FORM_LABELS[kind] ?? (kind && kind !== '—' ? kind : 'Без отметки');
}

/** Splits a stored lead source back into the form and the channel. */
export function splitSource(source: string | null | undefined) {
  const [form, ...rest] = (source ?? '').split(' · ');
  return { form: form || '—', channel: rest.join(' · ') || DIRECT };
}

/** Call once per page load in the browser. */
export function rememberVisit() {
  try {
    const channel = channelFrom(location.href, document.referrer, location.hostname);
    if (channel) localStorage.setItem(STORAGE_KEY, JSON.stringify({ channel, at: Date.now() }));
  } catch {
    // Storage blocked: the lead just says "direct".
  }
}

export function currentChannel(): string {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as {
      channel?: string;
      at?: number;
    } | null;
    if (saved?.channel && saved.at && Date.now() - saved.at < TTL_MS) return saved.channel;
  } catch {
    // Fall through.
  }
  return DIRECT;
}

/** Goals set up in Metrika: lead, call, whatsapp, telegram, email. */
export type Goal = 'lead' | 'call' | 'whatsapp' | 'telegram' | 'email';

export function reachGoal(goal: Goal) {
  const id = Number(SITE.metrikaId);
  const ym = (window as unknown as { ym?: (...args: unknown[]) => void }).ym;
  if (id && ym) ym(id, 'reachGoal', goal);
}

/** Which goal a clicked link counts as, if any. */
export function goalOfHref(href: string): Goal | null {
  if (href.startsWith('tel:')) return 'call';
  if (href.startsWith('mailto:')) return 'email';
  if (/^https?:\/\/(wa\.me|api\.whatsapp\.com)\//.test(href)) return 'whatsapp';
  if (/^https?:\/\/t\.me\//.test(href)) return 'telegram';
  return null;
}
