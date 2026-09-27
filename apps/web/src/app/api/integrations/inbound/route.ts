import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ingestMessage } from '@/lib/ingest';
import { bearerToken, inboundApiToken, safeEqual } from '@/lib/integrations';

export const dynamic = 'force-dynamic';

// Universal entry point for any other source (n8n, Make, a userbot, Avito
// parsers…): POST JSON with "Authorization: Bearer <token from /admin>".
const schema = z.object({
  text: z.string().min(1).max(4000),
  source: z.enum(['telegram', 'whatsapp', 'other']).default('other'),
  externalId: z.string().max(200).optional(),
  chat: z.string().max(200).optional(),
  author: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  url: z.string().url().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const expected = inboundApiToken();
  if (!expected || !safeEqual(bearerToken(request.headers.get('authorization')), expected)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { text, source, chat, author, phone, url } = parsed.data;
  const result = await ingestMessage({
    source: source === 'telegram' ? 'TELEGRAM' : source === 'whatsapp' ? 'WHATSAPP' : 'OTHER',
    externalId:
      parsed.data.externalId ?? `inbound:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    text,
    chatTitle: chat,
    authorName: author,
    authorPhone: phone,
    url,
  });
  return NextResponse.json(result, { status: result.status === 'created' ? 201 : 200 });
}
