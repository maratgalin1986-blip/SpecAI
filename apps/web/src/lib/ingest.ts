import { prisma, type OrderSource } from '@specai/database';
import { analyzeChatMessage } from '@specai/ai-service';
import { parseEquipmentRequest, requestFingerprint } from '@specai/shared';
import { notifyTelegram } from '@/lib/notify';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';

// Turns a message from a Telegram/WhatsApp chat into an order on the site's
// bidding board ("на торги"). Confident requests are published right away;
// doubtful ones wait in /admin for review. Offers from other providers and
// chatter are ignored.

export interface IncomingMessage {
  source: OrderSource;
  /** Stable id of the message, e.g. "telegram:-100123:456". */
  externalId: string;
  text: string;
  chatTitle?: string;
  authorName?: string;
  authorPhone?: string;
  url?: string;
}

export type IngestResult =
  | { status: 'created'; orderId: string; published: boolean }
  | { status: 'duplicate' | 'ignored' | 'too_short'; reason?: string };

const IMPORTER_EMAIL = 'imported-orders@specplast16.invalid';
const PUBLISH_CONFIDENCE = 0.7;
const REPOST_WINDOW_DAYS = 7;

async function importerUserId() {
  const user = await prisma.user.upsert({
    where: { email: IMPORTER_EMAIL },
    update: {},
    create: { email: IMPORTER_EMAIL, name: 'Заявка из мессенджера', role: 'CUSTOMER' },
  });
  return user.id;
}

function parseDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function locationFor(city: string | undefined) {
  if (!city) return undefined;
  const existing = await prisma.location.findFirst({ where: { city, addressLine: city } });
  if (existing) return existing.id;
  const created = await prisma.location.create({
    data: { addressLine: city, city, region: 'Республика Татарстан', country: 'Россия' },
  });
  return created.id;
}

export async function ingestMessage(message: IncomingMessage): Promise<IngestResult> {
  const text = message.text.trim();
  if (text.length < 12) return { status: 'too_short' };

  if (await prisma.order.findFirst({ where: { externalId: message.externalId } })) {
    return { status: 'duplicate', reason: 'same message' };
  }

  const fingerprint = requestFingerprint(text);
  const since = new Date(Date.now() - REPOST_WINDOW_DAYS * 86_400_000);
  if (await prisma.order.findFirst({ where: { fingerprint, createdAt: { gte: since } } })) {
    return { status: 'duplicate', reason: 'repost' };
  }

  const heuristic = parseEquipmentRequest(text);
  let isRequest = heuristic.isRequest;
  let confidence = heuristic.confidence;
  let categorySlug = heuristic.categorySlug;
  let city = heuristic.city;
  let start = heuristic.startDate;
  let end = heuristic.endDate;
  let summary: string | undefined;
  let phone = message.authorPhone ?? heuristic.phone;

  // With an API key, let the AI make the call (it handles slang and context).
  // Cheap pre-filter: only messages that mention equipment reach the AI.
  if (process.env.ANTHROPIC_API_KEY && heuristic.categorySlug) {
    try {
      const ai = await analyzeChatMessage(text, new Date().toISOString().slice(0, 10));
      isRequest = ai.is_request;
      confidence = ai.confidence;
      categorySlug = ai.category_slug ?? categorySlug;
      city = ai.city ?? city;
      start = parseDate(ai.start_date) ?? start;
      end = parseDate(ai.end_date) ?? end;
      if (end <= start) end = new Date(start.getTime() + 86_400_000);
      summary = ai.summary ?? undefined;
      phone = phone ?? ai.phone ?? undefined;
    } catch (error) {
      console.error('[ingest] AI analysis failed, using the rule-based parser', error);
    }
  }

  if (!isRequest) return { status: 'ignored', reason: heuristic.signals.join('; ') };

  const category = categorySlug
    ? await prisma.equipmentCategory.findUnique({ where: { slug: categorySlug } })
    : null;
  const published = confidence >= PUBLISH_CONFIDENCE;

  const order = await prisma.order.create({
    data: {
      customerId: await importerUserId(),
      description: (summary ?? text).slice(0, 2000),
      desiredStartDate: start,
      desiredEndDate: end,
      status: published ? 'OPEN' : 'PENDING_REVIEW',
      categoryId: category?.id,
      locationId: await locationFor(city),
      source: message.source,
      externalId: message.externalId,
      fingerprint,
      sourceChat: message.chatTitle?.slice(0, 200),
      sourceUrl: message.url,
      contactName: message.authorName?.slice(0, 200),
      contactPhone: phone,
      rawText: text.slice(0, 4000),
    },
  });

  const sourceLabel = message.source === 'WHATSAPP' ? 'WhatsApp' : 'Telegram';
  await notifyTelegram(
    [
      `${published ? '🆕 Новая заявка из чата' : '🕵️ Заявка на модерации'} — ${SITE.name}`,
      `Источник: ${sourceLabel}${message.chatTitle ? ` · ${message.chatTitle}` : ''}`,
      category ? `Техника: ${category.name}` : null,
      city ? `Где: ${city}` : null,
      `Текст: ${text.slice(0, 300)}`,
      message.authorName ? `Автор: ${message.authorName}` : null,
      phone ? `Телефон: ${phone}` : null,
      `${siteUrl()}${published ? `/orders/${order.id}` : '/admin'}`,
    ]
      .filter(Boolean)
      .join('\n'),
  );

  return { status: 'created', orderId: order.id, published };
}
