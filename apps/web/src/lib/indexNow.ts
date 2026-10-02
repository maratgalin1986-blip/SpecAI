import { siteUrl } from '@/lib/siteUrl';

// IndexNow: tells Yandex (and Bing) which pages exist, without a Webmaster
// account. The key file is public/<key>.txt; the protocol only asks that it
// is served from the same host.
export const INDEXNOW_KEY = '9b471fe09d1de9eea0de392c017cf8e9';

export async function submitToIndexNow(urls: string[]): Promise<number | null> {
  if (urls.length === 0) return null;
  const base = siteUrl();
  const response = await fetch('https://yandex.com/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(base).host,
      key: INDEXNOW_KEY,
      keyLocation: `${base}/${INDEXNOW_KEY}.txt`,
      urlList: urls.slice(0, 10_000),
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return response?.status ?? null;
}
