import { providerPath } from '@/lib/providerSeo';
import { siteUrl } from '@/lib/siteUrl';

// IndexNow: tells Yandex (and Bing, which shares the protocol) which pages are
// new or changed, without a Webmaster account. Two uses:
// - the weekly cron sends the whole sitemap (submitToIndexNow);
// - a new public page is announced at once (pingIndexNow): the order board
//   when an order is published, a provider's page when its first machine
//   appears. Order pages themselves are noindex and never sent.
//
// The key: INDEXNOW_KEY from the environment (8–128 letters, digits or «-»),
// else the key committed with the site (public/<key>.txt, in use since the
// weekly ping). INDEXNOW_KEY=off switches IndexNow off. The active key is
// also served at /indexnow.txt (app/indexnow.txt/route.ts), which every
// request names as keyLocation, so a new key works without a new file.
export const INDEXNOW_KEY = '9b471fe09d1de9eea0de392c017cf8e9';

const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;
let warnedBadKey = false;
export const INDEXNOW_ENDPOINT = 'https://yandex.com/indexnow';
export const KEY_FILE_PATH = '/indexnow.txt';

/** The key in use, or null when IndexNow is switched off. */
export function indexNowKey(raw: string | undefined = process.env.INDEXNOW_KEY): string | null {
  const value = raw?.trim();
  if (value?.toLowerCase() === 'off') return null;
  if (value && !KEY_PATTERN.test(value) && !warnedBadKey) {
    warnedBadKey = true;
    console.warn(
      '[indexnow] INDEXNOW_KEY is not 8–128 letters, digits or «-»; using the committed key',
    );
  }
  return value && KEY_PATTERN.test(value) ? value : INDEXNOW_KEY;
}

type Send = (body: IndexNowBody) => Promise<number | null>;

export interface IndexNowBody {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/** The request body; only URLs of the site's own host are kept (the protocol rejects others). */
export function indexNowBody(urls: string[], key: string, base: string): IndexNowBody | null {
  const host = new URL(base).host;
  const own = [
    ...new Set(
      urls.filter((url) => {
        try {
          return new URL(url).host === host;
        } catch {
          return false;
        }
      }),
    ),
  ];
  if (own.length === 0) return null;
  return {
    host,
    key,
    keyLocation: `${base}${KEY_FILE_PATH}`,
    urlList: own.slice(0, 10_000),
  };
}

async function postToIndexNow(body: IndexNowBody, timeoutMs = 10_000): Promise<number | null> {
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  }).catch(() => null);
  return response?.status ?? null;
}

/** The whole list at once (the weekly sitemap); the HTTP status, or null. */
export async function submitToIndexNow(urls: string[]): Promise<number | null> {
  const key = indexNowKey();
  const body = key ? indexNowBody(urls, key, siteUrl()) : null;
  return body ? postToIndexNow(body) : null;
}

export const PING_INTERVAL_MS = 60_000;
const MAX_PENDING = 500;

export type PingResult = 'sent' | 'queued' | 'off' | 'failed';

export interface PingerOptions {
  /** Whether pings go out at all (production only by default). */
  enabled: () => boolean;
  key: () => string | null;
  base: () => string;
  send: Send;
  intervalMs?: number;
  now?: () => number;
}

/**
 * A pinger that sends at most one request per `intervalMs`: URLs that come
 * sooner wait in a de-duplicated queue and go with the next request from
 * this server instance (the weekly sitemap submission catches anything left
 * behind by an instance that went cold). Never throws.
 */
export function createIndexNowPinger(options: PingerOptions) {
  const interval = options.intervalMs ?? PING_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const pending = new Set<string>();
  let lastSentAt = -Infinity;

  return async function ping(urls: string[]): Promise<PingResult> {
    try {
      const key = options.key();
      if (!options.enabled() || !key) return 'off';
      for (const url of urls) if (pending.size < MAX_PENDING) pending.add(url);
      if (pending.size === 0) return 'queued';
      if (now() - lastSentAt < interval) return 'queued';
      const batch = [...pending];
      pending.clear();
      const body = indexNowBody(batch, key, options.base());
      if (!body) return 'queued';
      lastSentAt = now();
      const status = await options.send(body).catch(() => null);
      if (status !== null && status >= 200 && status < 300) return 'sent';
      // A network error, 429 or 5xx: the pages go with the next request. A
      // 4xx refusal of the request itself is not retried.
      if (status === null || status === 429 || status >= 500) {
        for (const url of body.urlList) if (pending.size < MAX_PENDING) pending.add(url);
      }
      return 'failed';
    } catch {
      return 'failed';
    }
  };
}

/**
 * Tell Yandex about new or changed public pages (absolute URLs of this site).
 * Best-effort: production only, at most one request a minute, never throws.
 */
export const pingIndexNow = createIndexNowPinger({
  enabled: () => process.env.VERCEL_ENV === 'production',
  key: () => indexNowKey(),
  base: siteUrl,
  // Short: the caller (a new order, a new machine) waits for it.
  send: (body) => postToIndexNow(body, 3_000),
});

/** A new order on the board: the board page (/orders) changed. Order pages are noindex. */
export async function pingOrderBoard(): Promise<PingResult> {
  return pingIndexNow([`${siteUrl()}/orders`]);
}

/**
 * A provider added a machine: its page (/equipment/<id>) is new, and with the
 * company's first machine the company page (/providers/<id>) enters the sitemap.
 */
export async function pingNewMachine(input: {
  equipmentId: string;
  companyId: string;
  firstMachine: boolean;
}): Promise<PingResult> {
  const base = siteUrl();
  return pingIndexNow([
    `${base}/equipment/${encodeURIComponent(input.equipmentId)}`,
    ...(input.firstMachine ? [`${base}${providerPath(input.companyId)}`] : []),
  ]);
}
