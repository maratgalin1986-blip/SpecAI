import { NextRequest, NextResponse } from 'next/server';
import { ingestMessage } from '@/lib/ingest';
import { bearerToken, safeEqual, whatsappWebhookToken } from '@/lib/integrations';

export const dynamic = 'force-dynamic';

// WhatsApp has no official API for reading groups, so messages come through a
// gateway — Green API (green-api.com): its "incomingMessageReceived" webhook
// is sent here with "Authorization: Bearer <token from /admin>".
interface GreenApiWebhook {
  typeWebhook?: string;
  idMessage?: string;
  senderData?: { chatId?: string; chatName?: string; sender?: string; senderName?: string };
  messageData?: {
    typeMessage?: string;
    textMessageData?: { textMessage?: string };
    extendedTextMessageData?: { text?: string };
    imageMessageData?: { caption?: string };
  };
}

export async function POST(request: NextRequest) {
  const expected = whatsappWebhookToken();
  if (!expected || !safeEqual(bearerToken(request.headers.get('authorization')), expected)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as GreenApiWebhook | null;
  if (body?.typeWebhook !== 'incomingMessageReceived') return NextResponse.json({ ok: true });

  const data = body.messageData;
  const text =
    data?.textMessageData?.textMessage ??
    data?.extendedTextMessageData?.text ??
    data?.imageMessageData?.caption;
  const chatId = body.senderData?.chatId;
  if (!text || !chatId || !body.idMessage) return NextResponse.json({ ok: true });

  const senderDigits = body.senderData?.sender?.replace(/\D/g, '');
  const result = await ingestMessage({
    source: 'WHATSAPP',
    externalId: `whatsapp:${chatId}:${body.idMessage}`,
    text,
    chatTitle: chatId.endsWith('@g.us') ? body.senderData?.chatName : 'Личное сообщение',
    authorName: body.senderData?.senderName,
    authorPhone: senderDigits && senderDigits.length >= 10 ? `+${senderDigits}` : undefined,
  });
  return NextResponse.json({ ok: true, result: result.status });
}
