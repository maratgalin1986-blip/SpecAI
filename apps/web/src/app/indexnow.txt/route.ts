import { indexNowKey } from '@/lib/indexNow';

// The IndexNow key file (lib/indexNow.ts): Yandex and Bing fetch it to check
// that the pages we announce are ours. Public by the protocol's design, read
// only, no personal data. 404 while IndexNow is switched off.
export const dynamic = 'force-dynamic';

export function GET() {
  const key = indexNowKey();
  if (!key) return new Response('Not found', { status: 404 });
  return new Response(key, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
