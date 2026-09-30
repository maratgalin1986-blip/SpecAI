import { qrSvg } from '@/lib/qr';

export async function GET() {
  return new Response(await qrSvg(), {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    },
  });
}
