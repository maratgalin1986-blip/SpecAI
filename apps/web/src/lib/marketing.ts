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
  job: 'Страница работы',
  contacts: 'Контакты',
  orders: 'Страница заявки',
  'agents-chat': 'Чат с ИИ-агентами',
  smeta: 'Смета',
  'smeta-app': 'Полная смета (ранний доступ к приложению)',
  'smeta-snab': 'Смета для снабженца, заказ материалов',
  stroyka: 'Стройка (прогулка)',
  dizain: 'Дизайн-проект',
  provider: 'Поставщикам (старая форма)',
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

const YCLID_KEY = 'sp16_yclid';

/** Call once per page load in the browser. */
export function rememberVisit() {
  try {
    const channel = channelFrom(location.href, document.referrer, location.hostname);
    if (channel) localStorage.setItem(STORAGE_KEY, JSON.stringify({ channel, at: Date.now() }));
    // The Direct click id, so a lead can be matched to the ad click (30 days).
    const yclid = new URLSearchParams(location.search).get('yclid')?.replace(/\D/g, '');
    if (yclid)
      localStorage.setItem(
        YCLID_KEY,
        JSON.stringify({ yclid: yclid.slice(0, 24), at: Date.now() }),
      );
  } catch {
    // Storage blocked: the lead just says "direct".
  }
}

/** The remembered yclid of the last Direct click, if still fresh. */
export function currentYclid(): string {
  try {
    const saved = JSON.parse(localStorage.getItem(YCLID_KEY) ?? 'null') as {
      yclid?: string;
      at?: number;
    } | null;
    if (saved?.yclid && saved.at && Date.now() - saved.at < TTL_MS) return saved.yclid;
  } catch {
    // Fall through.
  }
  return '';
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

/**
 * Goals sent to Metrika. The first five are the contact goals set up in the
 * counter; the rest are micro-steps of the funnel (JS goals with these ids).
 */
export type Goal =
  | 'lead'
  | 'card_open'
  | 'call'
  | 'whatsapp'
  | 'telegram'
  | 'email'
  | 'intro_skip'
  | 'intro_full'
  | 'intro_offer'
  | 'hero_call'
  | 'geo_search'
  | 'geo_found'
  | 'geo_fail'
  | 'window_book'
  | 'lead_retry'
  | 'lead_offline_call'
  // Telegram funnel (2026-10-03): deep link taps, the Mini App, the calculator.
  | 'telegram_click'
  | 'miniapp_open'
  | 'calc_done';

/**
 * The cookie choice in localStorage: 'yes' («Согласен», Metrika on), 'no'
 * («Отключить Метрику» on /privacy) or `later:<ms>` (✕ on the strip: not now,
 * the strip comes back after COOKIE_SNOOZE_MS). Anything else, including the
 * old 'hidden' value, means no answer.
 */
export const COOKIE_CONSENT_KEY = 'cookie-consent';

/** ✕ on the strip hides it for a week. */
export const COOKIE_SNOOZE_MS = 7 * 86_400_000;

/** Dispatched on window when the choice is made elsewhere (/privacy): the notice hides. */
export const COOKIE_CHOICE_EVENT = 'cookie-choice';

/** The value ✕ stores: «not now», with the time it was pressed. */
export function snoozeValue(now = Date.now()) {
  return `later:${now}`;
}

/** Whether the strip should be shown for this stored value. */
export function cookieStripDue(value: string | null, now = Date.now()): boolean {
  if (value === 'yes' || value === 'no') return false;
  const at = Number(/^later:(\d+)$/.exec(value ?? '')?.[1]);
  return !(at && now - at >= 0 && now - at < COOKIE_SNOOZE_MS);
}

export function analyticsRefused(): boolean {
  try {
    return localStorage.getItem(COOKIE_CONSENT_KEY) === 'no';
  } catch {
    return false;
  }
}

type YmQueue = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
/**
 * What the inline script in YandexMetrika leaves on window: the `ym` queue
 * stub, the boot calls (init with the landing page's url and referrer, then
 * the A/B params) in `__ymBoot`, the tag.js address in `__ymSrc`, and
 * `__ymStarted` once the boot calls are queued and tag.js is requested.
 */
export type MetrikaWindow = {
  ym?: YmQueue;
  __ymOff?: boolean;
  __ymStarted?: boolean;
  __ymBoot?: unknown[][];
  __ymSrc?: string;
  Ya?: unknown;
};

type ScriptDocument = Pick<Document, 'createElement' | 'getElementsByTagName' | 'head' | 'scripts'>;

export function metrikaTagSrc(id: string) {
  return `https://mc.yandex.ru/metrika/tag.js?id=${id}`;
}

/**
 * The inline script YandexMetrika puts in the page (plain ES5, no imports).
 * It never loads anything: not on /admin; after a refusal it only keeps the
 * boot calls for a later «Включить Метрику»; otherwise it creates the queue
 * stub, and with consent stored it queues the boot calls and marks the
 * counter started, so the idle loader fetches tag.js.
 */
export function metrikaInitScript(id: string) {
  const init = `[${id},"init",{ssr:true,webvisor:true,clickmap:true,ecommerce:"dataLayer",referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true}]`;
  return (
    `(function(m,i){if(/^\\/admin/.test(location.pathname))return;` +
    `var v=null;try{v=localStorage.getItem(${JSON.stringify(COOKIE_CONSENT_KEY)})}catch(e){}` +
    `var b=[${init}];var c=/(?:^|;\\s*)sp_ab=(cine|calm)/.exec(document.cookie);` +
    `if(c)b.push([${id},"params",{ab:c[1]}]);m.__ymBoot=b;m.__ymSrc=${JSON.stringify(metrikaTagSrc(id))};` +
    `if(v==='no'){m.__ymOff=true;return}` +
    `m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();` +
    `if(v==='yes'){for(var k=0;k<b.length;k++)m[i].apply(null,b[k]);m.__ymStarted=true}` +
    `})(window,"ym");`
  );
}

/** The tiny queue Metrika's own snippet creates: calls wait in `ym.a`. */
function queueStub(): YmQueue {
  const ym: YmQueue = (...args: unknown[]) => {
    (ym.a = ym.a || []).push(args);
  };
  ym.a = [];
  ym.l = Date.now();
  return ym;
}

/**
 * Starts Metrika after consent («Согласен» or «Включить Метрику»), on the same
 * page: the boot calls go to the FRONT of the queue (so goals reached before
 * consent are sent after init), tag.js is requested, and the counter is
 * marked started, so a second call does nothing. Returns false when there is
 * nothing to start: not production, /admin, or already started.
 */
export function startMetrika(
  win: MetrikaWindow = window as unknown as MetrikaWindow,
  doc: ScriptDocument = document,
): boolean {
  if (win.__ymStarted || !win.__ymBoot || !win.__ymSrc) return false;
  // Refused earlier (this page or a previous one): the old queue is gone.
  if (win.__ymOff || !win.ym) win.ym = queueStub();
  win.__ymOff = false;
  const ym = win.ym;
  ym.a = [...win.__ymBoot.map((call) => [...call]), ...(ym.a ?? [])];
  win.__ymStarted = true;
  for (const script of Array.from(doc.scripts)) if (script.src === win.__ymSrc) return true;
  const tag = doc.createElement('script');
  tag.async = true;
  tag.src = win.__ymSrc;
  const first = doc.getElementsByTagName('script')[0];
  if (first?.parentNode) first.parentNode.insertBefore(tag, first);
  else doc.head.appendChild(tag);
  return true;
}

/**
 * «Отключить Метрику» on the current page: tag.js is not loaded if it has
 * not been yet (the loader in YandexMetrika checks `__ymOff`), the queued
 * calls are dropped and later calls go nowhere. On the next page load the
 * init script sees the refusal and does not create the queue at all.
 */
export function stopMetrika(win: MetrikaWindow = window as unknown as MetrikaWindow): boolean {
  // tag.js already running keeps its click map and link tracking until the
  // page is reloaded; the caller reloads when this returns true.
  const running = Boolean(win.Ya);
  win.__ymOff = true;
  if (!running) win.__ymStarted = false;
  if (win.ym?.a) win.ym.a.length = 0;
  if (win.ym) win.ym = Object.assign(() => {}, { a: [] });
  return running;
}

export function reachGoal(goal: Goal) {
  if (analyticsRefused()) return;
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
