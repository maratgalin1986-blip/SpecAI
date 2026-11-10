// «WhatsApp вручную» (владелец, 2026-11-10: «пиши в WhatsApp на контакты из карточки, коммерческое
// как шоу»). Сервер сам в WhatsApp не пишет (канал Green API не подключён): офис готовит
// очередь — фирма, номер из её карточки, персональный текст со ссылкой на коммерческое
// предложение /kp/<token>, — а владелец открывает чат ссылкой wa.me со своего телефона и
// нажимает «Отправить» сам. Так сообщение уходит от живого человека с его номера (ч. 2 ст. 18
// «О рекламе»), по одному на фирму. Отписанные адреса и номера в очередь не попадают (К3).
import { prisma } from '@specai/database';
import { mskDayBounds } from '@/lib/adminCrm';
import { siteUrl } from '@/lib/siteUrl';
import { parseSentOffer, type SentOffer } from './aiOffer';
import { parseDossier } from './dossier';
import { kpUrl } from './kp';
import { collectAngleStats, chooseAngle } from './learning';
import { nicheTitle } from './niches';
import { applicableAngles, buildOffer } from './offer';
import { buildWhatsAppText, OUTREACH_STATUSES, whatsappTarget } from './outreach';
import { officePrices } from './prices';
import { readOfficeSettings } from './settings';
import { emailKey, optedOutContacts } from './unsubscribe';

/** Сколько строк читаем из базы за раз (очередь режется дневным лимитом). */
export const MANUAL_BATCH = 200;

export interface ManualWhatsAppItem {
  id: string;
  kind: 'site' | 'provider';
  name: string;
  city: string | null;
  /** Номер как в карточке (+79…): видит только владелец в админке. */
  phone: string;
  /** Ссылка, открывающая чат с готовым текстом. */
  waUrl: string;
  text: string;
  /** Ссылка, которая стоит в сообщении: коммерческое предложение или превью. */
  link: string;
}

export interface ManualWhatsAppQueue {
  items: ManualWhatsAppItem[];
  /** Сколько сообщений уже ушло сегодня (вручную и сервером) и дневной лимит. */
  sentToday: number;
  dailyCap: number;
  paused: boolean;
}

export function waUrl(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

const ROW_SELECT = {
  id: true,
  kind: true,
  status: true,
  slug: true,
  token: true,
  name: true,
  phone: true,
  email: true,
  whatsapp: true,
  address: true,
  city: true,
  lat: true,
  lon: true,
  niche: true,
  tags: true,
  hours: true,
  dossierJson: true,
  offerJson: true,
} as const;

/** Очередь на сегодня: кому ещё не писали в WhatsApp и у кого номер есть в карточке. */
export async function manualWhatsAppQueue(now: Date): Promise<ManualWhatsAppQueue> {
  const settings = await readOfficeSettings();
  const bounds = mskDayBounds(now);
  const sentToday = await prisma.prospect.count({
    where: { whatsappSentAt: { gte: bounds.start, lt: bounds.end } },
  });
  const base = {
    items: [],
    sentToday,
    dailyCap: settings.dailyCap,
    paused: settings.outreachPaused,
  };
  const left = Math.max(0, settings.dailyCap - sentToday);
  if (settings.outreachPaused || left === 0) return base;

  const pick = { whatsappToPhone: settings.whatsappToPhone };
  const rows = await prisma.prospect.findMany({
    where: {
      status: { in: [...OUTREACH_STATUSES] },
      whatsappSentAt: null,
      optOutAt: null,
      OR: [
        { whatsapp: { startsWith: '+79' } },
        ...(settings.whatsappToPhone ? [{ phone: { startsWith: '+79' } }] : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: MANUAL_BATCH,
    select: ROW_SELECT,
  });
  if (rows.length === 0) return base;

  const blocked = await optedOutContacts(
    rows.map((r) => r.email),
    rows.flatMap((r) => [r.phone, r.whatsapp]),
    prisma,
  );
  const baseUrl = siteUrl();
  const prices = await officePrices();
  const stats = await collectAngleStats(prisma, 'site').catch(() => new Map());
  const items: ManualWhatsAppItem[] = [];
  for (const row of rows) {
    if (items.length >= left) break;
    if (
      blocked.emails.has(emailKey(row.email)) ||
      blocked.phones.has(row.phone.trim()) ||
      (row.whatsapp && blocked.phones.has(row.whatsapp.trim()))
    ) {
      continue;
    }
    const digits = whatsappTarget(row, pick);
    if (!digits) continue;
    const kind = row.kind === 'provider' ? 'provider' : 'site';
    let offer: SentOffer | undefined;
    let link = `${baseUrl.replace(/\/+$/, '')}/preview/${row.token}`;
    if (kind === 'site') {
      const dossier = parseDossier(row.dossierJson);
      offer = parseSentOffer(row.offerJson) ?? {
        ...buildOffer({
          dossier,
          angle: chooseAngle(applicableAngles(dossier), stats),
          companyName: row.name,
          city: row.city,
        }),
        ai: false,
      };
      // Что владелец видит в очереди, то и уйдёт: предложение записывается сразу.
      if (!parseSentOffer(row.offerJson)) {
        await prisma.prospect.updateMany({
          where: { id: row.id, status: { in: [...OUTREACH_STATUSES] } },
          data: { offerAngle: offer.angle, offerJson: JSON.stringify(offer) },
        });
      }
      link = kpUrl(baseUrl, row.token);
    }
    const text = buildWhatsAppText(
      { ...row, kind },
      {
        previewUrl: link,
        baseUrl,
        prices,
        nicheTitle: nicheTitle(row.niche),
        replyTo: settings.replyTo,
        ...(offer ? { offer } : {}),
      },
    );
    items.push({
      id: row.id,
      kind,
      name: row.name,
      city: row.city,
      phone: `+${digits}`,
      waUrl: waUrl(digits, text),
      text,
      link,
    });
  }
  return { ...base, items };
}

/**
 * Владелец отправил сообщение сам и нажал «Отправил»: отметка whatsappSentAt и CONTACTED —
 * только пока фирма ещё в рассылке и сообщения не было. false — уже отмечено или снята.
 */
export async function markManualWhatsAppSent(id: string, now: Date): Promise<boolean> {
  const row = await prisma.prospect.findUnique({
    where: { id },
    select: { contactedAt: true },
  });
  if (!row) return false;
  const { count } = await prisma.prospect.updateMany({
    where: { id, status: { in: [...OUTREACH_STATUSES] }, whatsappSentAt: null, optOutAt: null },
    data: {
      status: 'CONTACTED',
      whatsappSentAt: now,
      ...(row.contactedAt ? {} : { contactedAt: now }),
    },
  });
  return count > 0;
}
