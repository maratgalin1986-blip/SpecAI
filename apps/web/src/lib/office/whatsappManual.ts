// «WhatsApp вручную» (владелец, 2026-11-10: «пиши в WhatsApp на контакты из карточки, коммерческое
// как шоу»). Сервер сам в WhatsApp не пишет (канал Green API не подключён): офис готовит
// очередь — фирма, номер из её карточки, персональный текст со ссылкой на коммерческое
// предложение /kp/<token>, — а владелец открывает чат ссылкой wa.me со своего телефона и
// нажимает «Отправить» сам. Так сообщение уходит от живого человека с его номера (ч. 2 ст. 18
// «О рекламе»), по одному на фирму. Отписанные адреса и номера в очередь не попадают (К3).
import { prisma } from '@specai/database';
import { mskDayBounds } from '@/lib/adminCrm';
import { siteUrl } from '@/lib/siteUrl';
import { storedOfferOf, type SentOffer } from './aiOffer';
import { parseDossier } from './dossier';
import { kpUrl } from './kp';
import { collectAngleStats, chooseAngle, type AngleStat } from './learning';
import { nicheTitle } from './niches';
import { applicableAngles, buildOffer, type OfferAngle } from './offer';
import { buildWhatsAppText, OUTREACH_STATUSES, whatsappTarget } from './outreach';
import { officePrices } from './prices';
import { readOfficeSettings, type OfficeSettings } from './settings';
import { emailKey, optedOutContacts, type OptedOutContacts } from './unsubscribe';

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

/** Почему очередь такая: сколько фирм ещё ждут сообщения и у скольких есть номер. Только счётчики. */
export interface ManualWhatsAppCoverage {
  /** Фирм в рассылке, которым ещё не писали в WhatsApp и которые не отписались. */
  ready: number;
  /** Из них с номером, отмеченным в карточке как WhatsApp (+79…). */
  withWhatsappTag: number;
  /** Из них с мобильным телефоном в карточке (+79…). */
  withMobile: number;
  /** Включена ли настройка «писать и на обычный мобильный». */
  toPhone: boolean;
}

export interface ManualWhatsAppQueue {
  items: ManualWhatsAppItem[];
  /** Сколько сообщений уже ушло сегодня (вручную и сервером) и дневной лимит. */
  sentToday: number;
  dailyCap: number;
  paused: boolean;
  coverage: ManualWhatsAppCoverage;
}

/** Подпись флажка в настройках рассылки (OfficeOutreachForm) — цитируется в подсказке. */
export const TO_PHONE_LABEL =
  'Писать в WhatsApp и на обычный мобильный из карточки (не только на указанный как WhatsApp)';

/**
 * Пояснение к пустой очереди — чтобы ноль не оставался без причины. Пусто — пояснять нечего
 * (пауза: о ней страница говорит отдельно).
 */
export function emptyQueueNotes(
  queue: Pick<ManualWhatsAppQueue, 'sentToday' | 'dailyCap' | 'paused' | 'coverage'>,
): string[] {
  if (queue.paused) return [];
  const { ready, withWhatsappTag, withMobile, toPhone } = queue.coverage;
  if (ready === 0) return ['Поиск ещё не нашёл фирм с номером — очередь появится сама.'];
  const notes = [
    `Фирм, которым ещё не писали: ${ready}. С пометкой WhatsApp в карточке — ${withWhatsappTag}, с мобильным номером — ${withMobile}.`,
  ];
  if (queue.sentToday >= queue.dailyCap) {
    notes.push('Дневной лимит на сегодня исчерпан — очередь продолжится завтра.');
  } else if (!toPhone && withMobile > withWhatsappTag) {
    notes.push(
      `Сейчас в очередь попадают только номера с пометкой WhatsApp. Чтобы добавить мобильные номера, включите в настройках офиса флажок «${TO_PHONE_LABEL}».`,
    );
  }
  return notes;
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
  source: true,
} as const;

/** Строка Prospect в том объёме, который нужен очереди. */
export interface ManualRow {
  id: string;
  kind: string;
  status: string;
  slug: string;
  token: string;
  name: string;
  phone: string;
  email: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  niche: string;
  tags: string | null;
  hours: string | null;
  dossierJson: string | null;
  offerJson: string | null;
  source?: string | null;
}

type MobileMatch = { whatsapp: { startsWith: string } } | { phone: { startsWith: string } };

/** Фирма ещё ждёт сообщения: в рассылке, в WhatsApp не писали, не отписалась. */
interface WaitingWhere {
  status: { in: string[] };
  whatsappSentAt: null;
  optOutAt: null;
  whatsapp?: { startsWith: string };
  phone?: { startsWith: string };
  OR?: MobileMatch[];
}

/** Ровно те запросы к Prospect, которые делает очередь (prisma подходит структурно). */
export interface ManualDb {
  prospect: {
    count(args: {
      where: { whatsappSentAt: { gte: Date; lt: Date } } | WaitingWhere;
    }): Promise<number>;
    findMany(args: {
      where: WaitingWhere;
      orderBy: { createdAt: 'asc' };
      take: number;
      select: typeof ROW_SELECT;
    }): Promise<ManualRow[]>;
    updateMany(args: {
      where: { id: string; status: { in: string[] } };
      data: { offerAngle: string; offerJson: string };
    }): Promise<{ count: number }>;
  };
}

/** База, настройки и справочники внедряются, чтобы тесты шли без Prisma (как в outreachRun). */
export interface ManualDeps {
  db?: ManualDb;
  settings?: () => Promise<
    Pick<OfficeSettings, 'dailyCap' | 'outreachPaused' | 'whatsappToPhone' | 'replyTo'>
  >;
  prices?: typeof officePrices;
  baseUrl?: () => string;
  /** Какие из адресов и номеров отписаны (по умолчанию optedOutContacts по базе). */
  optedOut?: (emails: (string | null)[], phones: (string | null)[]) => Promise<OptedOutContacts>;
  /** Статистика заходов для выбора предложения (по умолчанию collectAngleStats по базе). */
  angleStats?: () => Promise<ReadonlyMap<OfferAngle, AngleStat>>;
}

const RU_MOBILE_PREFIX = '+79';

/** Очередь на сегодня: кому ещё не писали в WhatsApp и у кого номер есть в карточке. */
export async function manualWhatsAppQueue(
  now: Date,
  deps: ManualDeps = {},
): Promise<ManualWhatsAppQueue> {
  const db: ManualDb = deps.db ?? prisma;
  const settings = await (deps.settings ?? readOfficeSettings)();
  const bounds = mskDayBounds(now);
  const waiting = {
    status: { in: [...OUTREACH_STATUSES] },
    whatsappSentAt: null,
    optOutAt: null,
  };
  const [sentToday, ready, withWhatsappTag, withMobile] = await Promise.all([
    db.prospect.count({ where: { whatsappSentAt: { gte: bounds.start, lt: bounds.end } } }),
    db.prospect.count({ where: waiting }),
    db.prospect.count({ where: { ...waiting, whatsapp: { startsWith: RU_MOBILE_PREFIX } } }),
    db.prospect.count({ where: { ...waiting, phone: { startsWith: RU_MOBILE_PREFIX } } }),
  ]);
  const base: ManualWhatsAppQueue = {
    items: [],
    sentToday,
    dailyCap: settings.dailyCap,
    paused: settings.outreachPaused,
    coverage: { ready, withWhatsappTag, withMobile, toPhone: settings.whatsappToPhone },
  };
  const left = Math.max(0, settings.dailyCap - sentToday);
  if (settings.outreachPaused || left === 0) return base;

  const pick = { whatsappToPhone: settings.whatsappToPhone };
  const rows = await db.prospect.findMany({
    where: {
      ...waiting,
      OR: [
        { whatsapp: { startsWith: RU_MOBILE_PREFIX } },
        ...(settings.whatsappToPhone ? [{ phone: { startsWith: RU_MOBILE_PREFIX } }] : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: MANUAL_BATCH,
    select: ROW_SELECT,
  });
  if (rows.length === 0) return base;

  const optedOutOf =
    deps.optedOut ??
    ((emails: (string | null)[], phones: (string | null)[]) =>
      optedOutContacts(emails, phones, prisma));
  const blocked = await optedOutOf(
    rows.map((r) => r.email),
    rows.flatMap((r) => [r.phone, r.whatsapp]),
  );
  const baseUrl = (deps.baseUrl ?? siteUrl)();
  const prices = await (deps.prices ?? officePrices)();
  const stats = await (deps.angleStats ?? (() => collectAngleStats(prisma, 'site')))().catch(
    () => new Map<OfferAngle, AngleStat>(),
  );
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
      const dossier = parseDossier(row.dossierJson, row.source);
      offer = storedOfferOf(row) ?? {
        ...buildOffer({
          dossier,
          angle: chooseAngle(applicableAngles(dossier), stats),
          companyName: row.name,
          city: row.city,
        }),
        ai: false,
      };
      // Что владелец видит в очереди, то и уйдёт: предложение записывается сразу.
      if (!storedOfferOf(row)) {
        await db.prospect.updateMany({
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
