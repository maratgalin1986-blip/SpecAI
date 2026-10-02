import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@specai/database';
import { directMessageLead, needsLead } from '@/lib/botDirectMessage';
import { ingestMessage, type IngestResult } from '@/lib/ingest';
import { acceptLead } from '@/lib/leadIntake';
import { notifyTelegram } from '@/lib/notify';
import { SITE } from '@/lib/site';
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
  const senderPhone = senderDigits && senderDigits.length >= 10 ? `+${senderDigits}` : undefined;
  const isGroup = chatId.endsWith('@g.us');
  const incoming = {
    source: 'WHATSAPP' as const,
    externalId: `whatsapp:${chatId}:${body.idMessage}`,
    text,
    chatTitle: isGroup ? body.senderData?.chatName : 'Личное сообщение',
    authorName: body.senderData?.senderName,
    authorPhone: senderPhone,
  };
  if (isGroup) {
    const result = await ingestMessage(incoming);
    return NextResponse.json({ ok: true, result: result.status });
  }

  // Private message: never lost — if it is not an equipment request or the
  // database is down, it becomes a "call me back" lead with a Telegram alert.
  let result: IngestResult | null = null;
  try {
    result = await ingestMessage(incoming);
  } catch (error) {
    console.error('[whatsapp] could not import a private message', error);
  }
  if (!needsLead(result)) return NextResponse.json({ ok: true, result: result?.status });

  const outcome = await acceptLead(
    directMessageLead({
      channel: 'whatsapp',
      text,
      authorName: body.senderData?.senderName,
      phone: senderPhone,
      chatId,
    }),
    {
      save: (data) => prisma.lead.create({ data }),
      notify: notifyTelegram,
      siteName: SITE.name,
      onSaveError: (error) => console.error('[whatsapp] lead was not saved to the database', error),
    },
  );
  return NextResponse.json({ ok: true, result: result?.status ?? 'error', lead: outcome });
}
