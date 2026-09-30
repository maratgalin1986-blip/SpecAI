import { qrPng } from '@/lib/qr';

export const runtime = 'nodejs';

export async function GET() {
  return new Response(new Uint8Array(await qrPng()), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': 'inline; filename="specplast16-qr.png"',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    },
  });
}
