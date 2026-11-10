// Рассылка кандидатам (R18): один проход — кому ещё не писали, тем одно письмо и/или
// одно сообщение WhatsApp со ссылкой на превью; дневной лимит на канал по московским суткам;
// пауза одной кнопкой. Ответ «стоп» из вебхука WhatsApp переводит кандидата в DECLINED.
// После основного прохода — одно напоминание по почте тем, кто не ответил (S8), в том же
// дневном лимите писем. WhatsApp-напоминаний нет.
// Персональное предложение (U2): для сайта письмо и WhatsApp строятся из досье — заход
// выбирает обучение (learning.ts) по статистике, один раз за проход; при включённом
// ИИ-аналитике и в его дневном лимите вступление и пункты переписывает aiOffer.ts. Ушедшее
// предложение записывается в offerAngle/offerJson; второй канал берёт уже записанное.
// Бизнес-план, § 9.1 (К1–К4):
// - К1: письма уходят только со своего ящика по SMTP (smtp.ts), никогда через Resend; нет
//   SMTP — писем нет (`mail: 'no-smtp'`), строки кандидатов ошибкой не помечаются;
// - К2: в режиме 'approve' (по умолчанию) проход крона ничего не отправляет, а готовит «письма
//   дня» (planOutreach: выбирает заход и записывает offerAngle/offerJson — что утверждено, то и
//   уходит); отправляет их владелец кнопкой на /admin/office/pisma (`onlyApproved`);
// - К2: владелец утверждает каждое письмо по каналу (approvalKey: строка, канал, первое письмо или
//   напоминание): что показано без WhatsApp, то в WhatsApp и не уходит;
// - К3: в каждом письме ссылка «Больше не писать» и List-Unsubscribe (unsubscribe.ts); на адрес
//   и номер, у которых хоть одна строка отписана (optOutAt), офис не пишет ни в какой канал;
// - К4: напоминания — только через «письма дня»: ответы на почту офис не читает, поэтому в режиме
//   'auto' крон напоминаний не шлёт.
// База и отправители внедряются через deps, чтобы тесты шли без сети и без Prisma.
import { prisma } from '@specai/database';
import { mskDayBounds } from '@/lib/adminCrm';
import { sendWhatsApp, serverChannels } from '@/lib/notifications/adapters';
import { siteUrl } from '@/lib/siteUrl';
import { nicheTitle } from './niches';
import {
  buildEmail,
  buildFollowUpEmail,
  buildWhatsAppText,
  pickChannels,
  isStopReply,
  whatsappTarget,
  type OutreachChannel,
  type OutreachChannels,
  type OutreachEmail,
  type OutreachInput,
  type OutreachProspect,
  OUTREACH_STATUSES,
} from './outreach';
import { officePrices } from './prices';
import { AI_OFFER_TIMEOUT_MS, improveOffer, storedOfferOf, type SentOffer } from './aiOffer';
import { parseDossier } from './dossier';
import { collectAngleStats, chooseAngle, type AngleStat, type LearningDb } from './learning';
import { applicableAngles, buildOffer, type OfferAngle } from './offer';
import { readOfficeSettings, type OutreachMode } from '@/lib/office/settings';
import {
  officeMailConfigured,
  sendOfficeMail,
  type OfficeMail,
  type OfficeMailResult,
} from './smtp';
import {
  emailKey,
  optedOutContacts,
  unsubscribeConfigured,
  unsubscribeHeaders,
  unsubscribeLinks,
  type OptedOutContacts,
  type UnsubscribeLinks,
} from './unsubscribe';

/** Настройки рассылки из /admin/office (lib/office/settings.ts, T6). */
export interface OutreachRunSettings {
  outreachPaused: boolean;
  dailyCap: number;
  replyTo: string;
  whatsappToPhone: boolean;
  /** ИИ-аналитик предложений включён (по умолчанию нет). */
  aiOffers?: boolean;
  /** ИИ-предложений в московские сутки (по умолчанию DEFAULT_AI_DAILY_CAP). */
  aiDailyCap?: number;
  /** Режим рассылки (К2); не задан — 'approve'. */
  outreachMode?: OutreachMode;
}

/** Лимит ИИ-предложений в сутки, если настройки его не дали (как в settings.ts). */
export const DEFAULT_AI_DAILY_CAP = 30;
/** Метка в offerJson: предложение переписал ИИ (для подсчёта дневного лимита). */
export const AI_OFFER_MARK = '"ai":true';

/** Строка Prospect, как её читает рассылка. */
export interface OutreachRow {
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
  emailSentAt: Date | null;
  whatsappSentAt: Date | null;
  contactedAt: Date | null;
  followUpSentAt: Date | null;
  repliedAt: Date | null;
  /** Досье фирмы (U1); нет — общий заход. */
  dossierJson: string | null;
  /** Предложение, с которым уже писали (второй канал берёт его же). */
  offerJson: string | null;
  /** Источник карточки («osm», «nominatim+osm», «manual»): по неполным спискам числа соседей не считаются. */
  source?: string | null;
}

type DateRange = { gte: Date; lt: Date };

/** Ответ из WhatsApp: строка с таким номером WhatsApp или телефоном. */
type ReplyMatch = { whatsapp?: { endsWith: string }; phone?: { endsWith: string } };

/** Первому проходу ещё есть что отправить: письма не было и адрес есть, или WhatsApp — так же. */
type PendingMatch =
  | { emailSentAt: null; email: { not: null } }
  | { whatsappSentAt: null; whatsapp: { startsWith: string } }
  | { whatsappSentAt: null; phone: { startsWith: string } };

/**
 * Упавшие сегодня ждут до завтра (outreachErrorAt — время ошибки, не updatedAt). Явно через
 * `null`: `NOT { outreachErrorAt: { gte } }` в SQL даёт NULL для пустой колонки и отбросил бы
 * все строки, которые ни разу не падали.
 */
type NotFailedToday = [{ outreachErrorAt: null }, { outreachErrorAt: { lt: Date } }];

/** Начало российского мобильного номера, как его хранит Prospect (+79…, sources/phone.ts). */
const RU_MOBILE_PREFIX = '+79';

/** Ровно те запросы к Prospect, которые делает этот модуль (prisma подходит структурно). */
export interface OutreachDb {
  prospect: LearningDb['prospect'] & {
    count(args: {
      where: {
        emailSentAt?: DateRange;
        whatsappSentAt?: DateRange;
        followUpSentAt?: DateRange;
        contactedAt?: DateRange;
        offerJson?: { contains: string };
      };
    }): Promise<number>;
    findMany(args: {
      where: {
        status: { in: string[] };
        OR?: ReplyMatch[];
        /**
         * Первый проход: есть что отправить (PendingMatch) и не падал сегодня (NotFailedToday).
         * Напоминания — только второе.
         */
        AND?: ({ OR: PendingMatch[] } | { OR: NotFailedToday })[];
        /** Напоминание (S8): первое письмо ушло в этом окне, напоминания и ответа ещё не было. */
        emailSentAt?: { gte: Date; lte: Date };
        email?: { not: null };
        followUpSentAt?: null;
        repliedAt?: null;
      };
      orderBy:
        | { createdAt: 'asc' }
        | { contactedAt: 'desc' }
        | { emailSentAt: 'asc' }
        | ({ outreachError: { sort: 'asc'; nulls: 'first' } } | { createdAt: 'asc' })[];
      take: number;
    }): Promise<OutreachRow[]>;
    /** Запись меняется только пока она ещё в рассылке: «Согласился»/«стоп» за время прохода не перетираются. */
    updateMany(args: {
      where: { id: string; status: { in: string[] } };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
    update(args: {
      where: { id: string };
      data: {
        status?: string;
        emailSentAt?: Date;
        whatsappSentAt?: Date;
        contactedAt?: Date;
        repliedAt?: Date;
        declinedAt?: Date;
        optOutAt?: Date;
        outreachError?: string | null;
      };
    }): Promise<unknown>;
  };
}

/** Одно письмо офиса (по умолчанию sendOfficeMail — SMTP своего ящика, К1). */
export type OfficeMailSender = (mail: OfficeMail) => Promise<OfficeMailResult>;

export interface OutreachDeps {
  db?: OutreachDb;
  settings?: () => Promise<OutreachRunSettings>;
  /** Отправка письма; по умолчанию — SMTP ящика офиса, не Resend (К1). */
  email?: OfficeMailSender;
  whatsapp?: typeof sendWhatsApp;
  /** Какие каналы настроены; по умолчанию почта — SMTP и подпись ссылок отписки. */
  channels?: () => OutreachChannels;
  prices?: () => Promise<{ setup: number; monthly: number }>;
  sleep?: (ms: number) => Promise<void>;
  /** Базовый адрес площадки для ссылок на превью. */
  baseUrl?: () => string;
  /** Часы для бюджета времени (по умолчанию Date.now). */
  clock?: () => number;
  /** Сколько миллисекунд есть у этого прохода (крон делит своё время между шагами). */
  budgetMs?: number;
  /** ИИ-аналитик предложения (по умолчанию improveOffer). */
  improve?: (offer: SentOffer, dossier: ReturnType<typeof parseDossier>) => Promise<SentOffer>;
  /** Случайность выбора захода (learning.chooseAngle), для тестов. */
  random?: () => number;
  /** Ссылки «Больше не писать» для письма (по умолчанию unsubscribeLinks). */
  unsubscribe?: (baseUrl: string, token: string) => UnsubscribeLinks | null;
  /** Какие из адресов и номеров отписаны (по умолчанию optedOutContacts по базе). */
  optedOut?: (emails: string[], phones: string[]) => Promise<OptedOutContacts>;
  /**
   * Что владелец утвердил на /admin/office/pisma (К2) — ключи approvalKey(строка, канал, тип):
   * проход отправляет только их, в любом режиме, и только с уже записанным предложением — что
   * утверждено, то и уходит, ни в какой другой канал.
   */
  onlyApproved?: Iterable<string>;
}

export interface OutreachResult {
  email: number;
  whatsapp: number;
  /**
   * Напоминаний по почте (S8). sendOutreach заполняет всегда; необязательное — чтобы
   * заглушки результата в тике и его тестах оставались верными.
   */
  followUps?: number;
  /**
   * Почему проход ничего не отправил: 'paused' — рассылка на паузе; 'approve' — письма дня
   * ждут утверждения владельцем (К2); 'no-time' — нет времени; null — работал.
   */
  skipped: string | null;
  errors: number;
  /** Писем дня ждут кнопки «Отправить» (режим 'approve', К2). */
  waiting?: number;
  /** 'no-smtp' — ящик офиса не настроен, письма не уходят (К1). */
  mail?: 'no-smtp';
  /** Строк снято с рассылки: их адрес отписан (К3). */
  optedOut?: number;
}

/** Одно письмо (или сообщение) дня, как его видит владелец перед отправкой (К2). */
export interface OutboxItem {
  id: string;
  /** Первое письмо или напоминание. */
  type: 'first' | 'followUp';
  kind: 'site' | 'provider';
  name: string;
  city: string | null;
  /** Адрес письма; null — письма не будет, только WhatsApp. */
  email: string | null;
  /** Уйдёт ли и сообщение WhatsApp. */
  whatsapp: boolean;
  subject: string;
  /** Вступление персонального предложения; у прочих писем — первый абзац. */
  opener: string;
  bullets: string[];
  /** Ключи утверждения (approvalKey): по одному на канал, который показан владельцу. */
  approve: string[];
}

/** Первое письмо или напоминание — утверждаются отдельно. */
export type ApprovalType = OutboxItem['type'];

/** Ключ утверждения одного отправления (К2): строка, канал, первое письмо или напоминание. */
export function approvalKey(id: string, channel: OutreachChannel, type: ApprovalType): string {
  return `${id}:${channel}:${type}`;
}

export interface OutreachPlan {
  items: OutboxItem[];
  /** 'paused' / 'no-time' — список не собран. */
  skipped: string | null;
  mail?: 'no-smtp';
  optedOut?: number;
}

/** Сколько кандидатов берём за проход: лимит в день редко больше. */
export const OUTREACH_BATCH = 50;
/** Бюджет времени прохода, мс — укладываемся в maxDuration крона. */
export const OUTREACH_BUDGET_MS = 40_000;
/** Одна отправка (SMTP / Green API) не длиннее этого — иначе функция крона не успеет записать отметку. */
export const SEND_TIMEOUT_MS = 8_000;
/** Напоминание — не раньше, чем через столько дней после первого письма (S8). */
export const FOLLOW_UP_AFTER_DAYS = 4;
/** …и не позже: напоминание о письме месячной давности («недавно мы писали») уже не к месту. */
export const FOLLOW_UP_MAX_DAYS = 14;
/** Напоминание получает только тот, кому писали и кто ещё в рассылке (не ответил отказом, не согласился). */
export const FOLLOW_UP_STATUSES: readonly string[] = ['CONTACTED'];

const DAY_MS = 24 * 60 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label}: нет ответа за ${Math.round(ms / 1000)} с`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
/** Пауза между сообщениями WhatsApp, мс (1–2 с, как у живого человека). */
export const WHATSAPP_PAUSE_MS: readonly [number, number] = [1000, 2000];

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pauseMs(): number {
  const [min, max] = WHATSAPP_PAUSE_MS;
  return min + Math.floor(Math.random() * (max - min + 1));
}

const ERROR_LABELS = {
  email: 'Письмо не отправлено',
  whatsapp: 'WhatsApp не отправлен',
  followUp: 'Напоминание не отправлено',
} as const;

/** Текст ошибки для outreachError: по-русски, не длиннее 300 символов. */
export function outreachErrorText(channel: keyof typeof ERROR_LABELS, reason: string): string {
  return `${ERROR_LABELS[channel]}: ${reason}`.slice(0, 300);
}

/** Окно первого письма для напоминания (S8): от FOLLOW_UP_MAX_DAYS до FOLLOW_UP_AFTER_DAYS назад. */
export function followUpWindow(now: Date): { gte: Date; lte: Date } {
  return {
    gte: new Date(now.getTime() - FOLLOW_UP_MAX_DAYS * DAY_MS),
    lte: new Date(now.getTime() - FOLLOW_UP_AFTER_DAYS * DAY_MS),
  };
}

type Delivery = { ok: true } | { ok: false; reason: string };

/** Одно письмо со своего ящика с таймаутом; Reply-To — адрес владельца, отписка в заголовках. */
async function deliverEmail(
  send: OfficeMailSender,
  to: string,
  letter: OutreachEmail,
  replyTo: string,
  links: UnsubscribeLinks,
): Promise<Delivery> {
  return withTimeout(
    send({
      to,
      subject: letter.subject,
      html: letter.html,
      text: letter.text,
      ...(replyTo.trim() ? { replyTo: replyTo.trim() } : {}),
      headers: unsubscribeHeaders(links),
    }),
    SEND_TIMEOUT_MS,
    'Почта',
  ).catch((error: unknown) => ({
    ok: false as const,
    reason: error instanceof Error ? error.message : String(error),
  }));
}

function previewUrlOf(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/preview/${encodeURIComponent(token)}`;
}

function toProspect(row: OutreachRow): OutreachProspect {
  return {
    kind: row.kind === 'provider' ? 'provider' : 'site',
    status: row.status,
    slug: row.slug,
    name: row.name,
    phone: row.phone,
    address: row.address,
    city: row.city,
    lat: row.lat,
    lon: row.lon,
    tags: row.tags,
    hours: row.hours,
    email: row.email,
  };
}

/** Каналы по умолчанию: почта — свой ящик и подпись ссылок отписки (К1, К3), не Resend. */
function defaultChannels(): OutreachChannels {
  return {
    email: officeMailConfigured() && unsubscribeConfigured(),
    whatsapp: serverChannels().whatsapp,
  };
}

/** Первый абзац письма (текстовая часть после приветствия) — для списка писем дня. */
function firstParagraph(letter: OutreachEmail): string {
  const parts = letter.text.split('\n\n');
  return (parts[1] ?? parts[0] ?? '').trim();
}

type Mode = 'send' | 'plan';

/**
 * Общий проход: 'send' — отправляет; 'plan' — ничего не отправляет, только готовит и
 * записывает предложения и собирает список писем дня в пределах дневного лимита.
 */
async function runOutreach(
  now: Date,
  deps: OutreachDeps,
  mode: Mode,
  settings: OutreachRunSettings,
): Promise<{ result: OutreachResult; items: OutboxItem[] }> {
  const budgetMs = Math.max(0, deps.budgetMs ?? OUTREACH_BUDGET_MS);
  const result: OutreachResult = { email: 0, whatsapp: 0, followUps: 0, skipped: null, errors: 0 };
  const items: OutboxItem[] = [];
  const done = () => ({ result, items });
  if (budgetMs < 2_000) {
    result.skipped = 'no-time';
    return done();
  }
  const db: OutreachDb = deps.db ?? prisma;
  const only = deps.onlyApproved ? new Set(deps.onlyApproved) : null;

  const channels = (deps.channels ?? defaultChannels)();
  if (!channels.email) result.mail = 'no-smtp';
  const cap = Math.max(0, Math.floor(settings.dailyCap));
  const bounds = mskDayBounds(now);
  const day = { gte: bounds.start, lt: bounds.end };
  // Напоминания — в том же дневном лимите писем, что и первые письма.
  const [emailToday, followUpsToday, whatsappToday] = await Promise.all([
    db.prospect.count({ where: { emailSentAt: day } }),
    db.prospect.count({ where: { followUpSentAt: day } }),
    db.prospect.count({ where: { whatsappSentAt: day } }),
  ]);
  let emailLeft = Math.max(0, cap - emailToday - followUpsToday);
  let whatsappLeft = Math.max(0, cap - whatsappToday);
  const active: OutreachChannels = {
    // Письма дня видны владельцу и без настроенного ящика: он сразу видит персональные
    // предложения; отправка без ящика всё равно невозможна (mail: 'no-smtp').
    email: (channels.email || mode === 'plan') && emailLeft > 0,
    whatsapp: channels.whatsapp && whatsappLeft > 0,
  };
  if (!active.email && !active.whatsapp) return done();

  const email = deps.email ?? sendOfficeMail;
  const whatsapp = deps.whatsapp ?? sendWhatsApp;
  const sleep = deps.sleep ?? defaultSleep;
  const clock = deps.clock ?? Date.now;
  const startedAt = clock();
  const timeLeft = () => budgetMs - (clock() - startedAt);
  const outOfTime = () => timeLeft() < 0;
  const baseUrl = (deps.baseUrl ?? siteUrl)();
  const linksFor = (row: OutreachRow) =>
    (deps.unsubscribe ?? ((base: string, token: string) => unsubscribeLinks(base, token)))(
      baseUrl,
      row.token,
    );
  const optedOutOf =
    deps.optedOut ??
    ((emails: string[], phones: string[]) => optedOutContacts(emails, phones, prisma));
  let prices: Promise<{ setup: number; monthly: number }> | null = null;
  const inputFor = async (
    row: OutreachRow,
    offer?: SentOffer,
    links?: UnsubscribeLinks | null,
  ): Promise<OutreachInput> => ({
    previewUrl: previewUrlOf(baseUrl, row.token),
    baseUrl,
    prices: await (prices ??= (deps.prices ?? officePrices)()),
    nicheTitle: nicheTitle(row.niche),
    replyTo: settings.replyTo,
    ...(offer ? { offer } : {}),
    ...(links ? { unsubscribeUrl: links.page } : {}),
  });

  // Персональное предложение (U2): статистика заходов — один раз за проход и только если
  // есть кому писать о сайте; ИИ — в остатке дневного лимита.
  let stats: Promise<Map<OfferAngle, AngleStat>> | null = null;
  let aiLeft: number | null = null;
  const aiCap = Math.max(0, Math.floor(settings.aiDailyCap ?? DEFAULT_AI_DAILY_CAP));
  const improve = deps.improve ?? ((offer, dossier) => improveOffer(offer, dossier));
  const offerFor = async (row: OutreachRow): Promise<SentOffer> => {
    const stored = storedOfferOf(row);
    if (stored) return stored;
    const dossier = parseDossier(row.dossierJson, row.source);
    const angleStats = await (stats ??= collectAngleStats(db, 'site').catch(
      () => new Map<OfferAngle, AngleStat>(),
    ));
    const angle = chooseAngle(applicableAngles(dossier), angleStats, deps.random);
    const offer: SentOffer = {
      ...buildOffer({ dossier, angle, companyName: row.name, city: row.city }),
      ai: false,
    };
    if (!settings.aiOffers || aiCap === 0) return offer;
    aiLeft ??= Math.max(
      0,
      aiCap -
        (await db.prospect.count({
          where: { contactedAt: day, offerJson: { contains: AI_OFFER_MARK } },
        })),
    );
    if (aiLeft <= 0) return offer;
    // ИИ — только если после его ответа ещё останется время на отправку.
    if (timeLeft() < AI_OFFER_TIMEOUT_MS + SEND_TIMEOUT_MS) return offer;
    aiLeft -= 1;
    return improve(offer, dossier).catch(() => offer);
  };

  // Отписка (К3): адрес или номер, у которых хоть одна строка отписана (ссылка, «стоп», «Отказ»
  // владельца), снимается с рассылки и здесь — во всех каналах; строка уходит в DECLINED с
  // optOutAt, чтобы больше не попадать в проход.
  const dropOptedOut = async (
    list: OutreachRow[],
    statuses: readonly string[],
  ): Promise<OutreachRow[]> => {
    const emails = list.map((r) => emailKey(r.email)).filter((e) => e.length > 0);
    const phones = list.flatMap((r) => [r.phone, r.whatsapp ?? '']).filter((p) => p.length > 0);
    if (emails.length === 0 && phones.length === 0) return list;
    const blocked = await optedOutOf(emails, phones);
    if (blocked.emails.size === 0 && blocked.phones.size === 0) return list;
    const isBlocked = (row: OutreachRow) =>
      blocked.emails.has(emailKey(row.email)) ||
      blocked.phones.has(row.phone.trim()) ||
      (!!row.whatsapp && blocked.phones.has(row.whatsapp.trim()));
    const kept: OutreachRow[] = [];
    for (const row of list) {
      if (!isBlocked(row)) {
        kept.push(row);
        continue;
      }
      const stamp = new Date();
      const { count } = await db.prospect.updateMany({
        where: { id: row.id, status: { in: [...statuses] } },
        data: { status: 'DECLINED', declinedAt: stamp, optOutAt: stamp },
      });
      result.optedOut = (result.optedOut ?? 0) + count;
    }
    return kept;
  };

  // Сначала те, у кого отправка ещё не падала; упавшие сегодня ждут до завтра —
  // одна повторная попытка в день, чтобы вечно битые адреса не съедали проход.
  const notFailedToday: NotFailedToday = [
    { outreachErrorAt: null },
    { outreachErrorAt: { lt: bounds.start } },
  ];
  // Только строки, которым ещё есть что отправить по включённым каналам: иначе пачку заняли бы
  // кандидаты без контактов и те, кому уже написали, и до новых очередь не дошла бы.
  const pending: PendingMatch[] = [];
  if (active.email) pending.push({ emailSentAt: null, email: { not: null } });
  if (active.whatsapp) {
    pending.push({ whatsappSentAt: null, whatsapp: { startsWith: RU_MOBILE_PREFIX } });
    if (settings.whatsappToPhone) {
      pending.push({ whatsappSentAt: null, phone: { startsWith: RU_MOBILE_PREFIX } });
    }
  }
  const rows = await dropOptedOut(
    await db.prospect.findMany({
      where: {
        status: { in: ['READY', 'CONTACTED'] },
        AND: [{ OR: pending }, { OR: notFailedToday }],
      },
      orderBy: [{ outreachError: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      take: OUTREACH_BATCH,
    }),
    OUTREACH_STATUSES,
  );
  const pick = { whatsappToPhone: settings.whatsappToPhone, channels: active };
  let whatsappSent = false;

  for (const row of rows) {
    if (outOfTime()) break;
    if (emailLeft <= 0) active.email = false;
    if (whatsappLeft <= 0) active.whatsapp = false;
    if (!active.email && !active.whatsapp) break;

    // Утверждённое владельцем — по каналу: что он видел без WhatsApp, в WhatsApp не уходит.
    const wanted = pickChannels(row, pick).filter(
      (channel) => !only || only.has(approvalKey(row.id, channel, 'first')),
    );
    if (wanted.length === 0) continue;
    const prospect = toProspect(row);
    // Утверждённое письмо о сайте уходит только с тем предложением, что видел владелец.
    if (only && prospect.kind === 'site' && !storedOfferOf(row)) continue;
    // Подрядчикам (provider) — прежнее письмо, без персонального предложения.
    const offer = prospect.kind === 'site' ? await offerFor(row) : undefined;
    const offerData = offer ? { offerAngle: offer.angle, offerJson: JSON.stringify(offer) } : {};
    const links = wanted.includes('email') && row.email ? linksFor(row) : null;
    const input = await inputFor(row, offer, links);
    const mailTo = links && row.email ? row.email.trim() : null;
    const toWhatsApp = wanted.includes('whatsapp') ? whatsappTarget(row, pick) : null;
    if (!mailTo && !toWhatsApp) continue;

    if (mode === 'plan') {
      const letter = buildEmail(prospect, input);
      items.push({
        id: row.id,
        type: 'first',
        kind: prospect.kind,
        name: row.name,
        city: row.city,
        email: mailTo,
        whatsapp: Boolean(toWhatsApp),
        subject: letter.subject,
        opener: offer?.opener ?? firstParagraph(letter),
        bullets: offer?.bullets ?? [],
        approve: [
          ...(mailTo ? [approvalKey(row.id, 'email', 'first')] : []),
          ...(toWhatsApp ? [approvalKey(row.id, 'whatsapp', 'first')] : []),
        ],
      });
      if (mailTo) emailLeft -= 1;
      if (toWhatsApp) whatsappLeft -= 1;
      // Что владелец утвердит, то и уйдёт: предложение записывается сразу, статус не меняется.
      if (offer && !storedOfferOf(row)) {
        await db.prospect.updateMany({
          where: { id: row.id, status: { in: [...OUTREACH_STATUSES] } },
          data: offerData,
        });
      }
      continue;
    }

    // Строка начинается, только если все её отправки успевают в остаток бюджета: иначе функцию
    // могут остановить между отправкой и отметкой, и завтра письмо уйдёт ещё раз.
    const needed =
      (mailTo ? SEND_TIMEOUT_MS : 0) + (toWhatsApp ? SEND_TIMEOUT_MS + WHATSAPP_PAUSE_MS[1] : 0);
    if (timeLeft() < needed) break;

    const sentAt = new Date();
    const success = {
      status: 'CONTACTED',
      outreachError: null,
      outreachErrorAt: null,
      ...(row.contactedAt ? {} : { contactedAt: sentAt }),
      ...offerData,
    };

    if (mailTo && links) {
      const sent = await deliverEmail(
        email,
        mailTo,
        buildEmail(prospect, input),
        settings.replyTo,
        links,
      );
      if (sent.ok) {
        emailLeft -= 1;
        result.email += 1;
        await db.prospect.updateMany({
          where: { id: row.id, status: { in: [...OUTREACH_STATUSES] } },
          data: { ...success, emailSentAt: sentAt },
        });
      } else if (sent.reason === 'no-smtp') {
        // Ящик не настроен — это не ошибка кандидата: почта на этот проход выключается.
        result.mail = 'no-smtp';
        active.email = false;
      } else {
        result.errors += 1;
        await db.prospect.updateMany({
          where: { id: row.id, status: { in: [...OUTREACH_STATUSES] } },
          data: {
            outreachError: outreachErrorText('email', sent.reason),
            outreachErrorAt: new Date(),
          },
        });
      }
    }

    if (toWhatsApp) {
      if (whatsappSent) await sleep(pauseMs());
      whatsappSent = true;
      const sent = await withTimeout(
        whatsapp(toWhatsApp, buildWhatsAppText(prospect, input)),
        SEND_TIMEOUT_MS,
        'WhatsApp',
      ).catch((error: unknown) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      }));
      if (sent.ok) {
        whatsappLeft -= 1;
        result.whatsapp += 1;
        await db.prospect.updateMany({
          where: { id: row.id, status: { in: [...OUTREACH_STATUSES] } },
          data: { ...success, whatsappSentAt: new Date() },
        });
      } else {
        result.errors += 1;
        await db.prospect.updateMany({
          where: { id: row.id, status: { in: [...OUTREACH_STATUSES] } },
          data: {
            outreachError: outreachErrorText('whatsapp', sent.error),
            outreachErrorAt: new Date(),
          },
        });
      }
    }
  }

  // Напоминания (S8): одно письмо тем, кому писали 4–14 дней назад и кто не ответил;
  // в остатке дневного лимита писем и бюджета времени. Только через «письма дня» (К4): ответы на
  // почту офис не читает, и крон в режиме 'auto' не напомнит тому, кто уже ответил «стоп» письмом.
  if (
    (mode === 'send' && (!only || !channels.email || result.mail === 'no-smtp')) ||
    emailLeft <= 0 ||
    outOfTime()
  ) {
    return done();
  }
  const due = await dropOptedOut(
    await db.prospect.findMany({
      where: {
        status: { in: [...FOLLOW_UP_STATUSES] },
        emailSentAt: followUpWindow(now),
        email: { not: null },
        followUpSentAt: null,
        repliedAt: null,
        AND: [{ OR: notFailedToday }],
      },
      orderBy: { emailSentAt: 'asc' },
      take: OUTREACH_BATCH,
    }),
    FOLLOW_UP_STATUSES,
  );
  for (const row of due) {
    if (emailLeft <= 0 || outOfTime()) break;
    if (mode === 'send' && timeLeft() < SEND_TIMEOUT_MS) break;
    if (only && !only.has(approvalKey(row.id, 'email', 'followUp'))) continue;
    const to = row.email?.trim();
    if (!to) continue;
    const links = linksFor(row);
    if (!links) continue;
    const letter = buildFollowUpEmail(toProspect(row), await inputFor(row, undefined, links));
    if (mode === 'plan') {
      items.push({
        id: row.id,
        type: 'followUp',
        kind: row.kind === 'provider' ? 'provider' : 'site',
        name: row.name,
        city: row.city,
        email: to,
        whatsapp: false,
        subject: letter.subject,
        opener: firstParagraph(letter),
        bullets: [],
        approve: [approvalKey(row.id, 'email', 'followUp')],
      });
      emailLeft -= 1;
      continue;
    }
    const sent = await deliverEmail(email, to, letter, settings.replyTo, links);
    // Запись — только пока кандидат ещё CONTACTED: «Согласился»/«стоп» за время прохода не перетираются.
    const guard = { id: row.id, status: { in: [...FOLLOW_UP_STATUSES] } };
    if (sent.ok) {
      emailLeft -= 1;
      result.followUps = (result.followUps ?? 0) + 1;
      await db.prospect.updateMany({
        where: guard,
        data: { followUpSentAt: new Date(), outreachError: null, outreachErrorAt: null },
      });
    } else if (sent.reason === 'no-smtp') {
      result.mail = 'no-smtp';
      break;
    } else {
      result.errors += 1;
      await db.prospect.updateMany({
        where: guard,
        data: {
          outreachError: outreachErrorText('followUp', sent.reason),
          outreachErrorAt: new Date(),
        },
      });
    }
  }
  return done();
}

/**
 * Один проход рассылки. Возвращает, сколько писем, сообщений и напоминаний ушло, сколько
 * ошибок, и `skipped: 'paused'`, если владелец поставил рассылку на паузу. В режиме
 * 'approve' (К2) без `onlyApproved` ничего не отправляет: готовит письма дня и возвращает
 * `skipped: 'approve'` и `waiting` — сколько их ждёт кнопки владельца.
 */
export async function sendOutreach(now: Date, deps: OutreachDeps = {}): Promise<OutreachResult> {
  const settings = await (deps.settings ?? readOfficeSettings)();
  if (settings.outreachPaused) {
    return { email: 0, whatsapp: 0, followUps: 0, skipped: 'paused', errors: 0 };
  }
  if (!deps.onlyApproved && settings.outreachMode !== 'auto') {
    const { result, items } = await runOutreach(now, deps, 'plan', settings);
    if (result.skipped) return result;
    return { ...result, skipped: 'approve', waiting: items.length };
  }
  return (await runOutreach(now, deps, 'send', settings)).result;
}

/**
 * Письма дня (К2) для /admin/office/pisma: кому, тема, вступление и пункты — в пределах
 * дневного лимита; ничего не отправляет, но записывает выбранные предложения, чтобы ушло
 * ровно то, что владелец видел.
 */
export async function planOutreach(now: Date, deps: OutreachDeps = {}): Promise<OutreachPlan> {
  const settings = await (deps.settings ?? readOfficeSettings)();
  if (settings.outreachPaused) return { items: [], skipped: 'paused' };
  const { result, items } = await runOutreach(
    now,
    { ...deps, onlyApproved: undefined },
    'plan',
    settings,
  );
  return {
    items,
    skipped: result.skipped,
    ...(result.mail ? { mail: result.mail } : {}),
    ...(result.optedOut ? { optedOut: result.optedOut } : {}),
  };
}

/** Статусы, в которых ответ кандидата ещё что-то значит. */
const REPLY_STATUSES = ['CONTACTED', 'READY', 'CALLBACK'];

/**
 * Входящее сообщение WhatsApp от кандидата (вебхук Green API): отмечает `repliedAt`
 * у кандидата с таким номером WhatsApp или телефоном; «стоп» → DECLINED и optOutAt, чтобы
 * ни его почта, ни этот номер больше ничего не получили (К3).
 */
export async function markReplied(
  fromPhoneDigits: string,
  text: string,
  now: Date,
  db: OutreachDb = prisma,
): Promise<{ matched: boolean; stopped: boolean }> {
  const digits = fromPhoneDigits.replace(/\D/g, '');
  if (digits.length < 10) return { matched: false, stopped: false };
  const tail = digits.slice(-10);
  // Phones are stored as «+7XXXXXXXXXX» (lib/office/sources/phone.ts), so the last ten
  // digits match both the WhatsApp number and the card phone.
  const rows = await db.prospect.findMany({
    where: {
      status: { in: REPLY_STATUSES },
      OR: [{ whatsapp: { endsWith: tail } }, { phone: { endsWith: tail } }],
    },
    orderBy: { contactedAt: 'desc' },
    take: 5,
  });
  if (rows.length === 0) return { matched: false, stopped: false };
  const stopped = isStopReply(text);
  for (const row of rows) {
    await db.prospect.update({
      where: { id: row.id },
      data: {
        repliedAt: now,
        ...(stopped ? { status: 'DECLINED', declinedAt: now, optOutAt: now } : {}),
      },
    });
  }
  return { matched: true, stopped };
}
