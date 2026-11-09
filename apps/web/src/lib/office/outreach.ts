// Рассылка кандидатам офиса агентов (R18, решение владельца 2026-11-09): чистые
// шаблоны письма и сообщения WhatsApp и выбор каналов. Одно сообщение на компанию и
// канал; адресат — только контакт из открытой карточки компании; в каждом тексте —
// строка «ответьте «стоп»» (R18a). Без «лучшая цена / гарантируем / самые»
// (REVIEW § 5), без выдуманных цифр: единственные числа — цены из настроек.
// «Сайты под ключ» (S8, S12): в письме и WhatsApp для сайта — ссылка «Кто мы и цены» на
// страницу услуги с метками и строка о заявках на почту; одно напоминание по почте.
import { SERVICE_PAGE_PATH } from './clientSite';
import { quotedName } from './pages';
import { PLATFORM_PROMISE, PLATFORM_PROMISE_DETAIL } from '@specai/shared';
import { escapeHtml } from '@/lib/emailTemplates';
import { SITE } from '@/lib/site';
import type { PageProspect } from './pageTypes';
import { phoneDigits } from './pages';
import { rubles } from './scripts';

export type OutreachChannel = 'email' | 'whatsapp';

/** Кандидат, как его видит рассылка: страница плюс адрес почты. */
export type OutreachProspect = PageProspect & { email: string | null };

export interface OutreachInput {
  previewUrl: string;
  /** Базовый адрес площадки (siteUrl()): ссылка «Кто мы и цены» на страницу услуги. */
  baseUrl: string;
  /** Цена сайта и поддержка в месяц (R16), в рублях. */
  prices: { setup: number; monthly: number };
  nicheTitle: string;
  /** Адрес, на который приходят ответы (Reply-To). */
  replyTo: string;
}

export interface OutreachEmail {
  subject: string;
  text: string;
  html: string;
}

/** Что умеет сервер: сконфигурирован ли канал (serverChannels()). */
export interface OutreachChannels {
  email: boolean;
  whatsapp: boolean;
}

export interface OutreachSettings {
  /** Писать в WhatsApp и на обычный мобильный из карточки, не только на contact:whatsapp. */
  whatsappToPhone: boolean;
  channels: OutreachChannels;
}

/** Поля кандидата, по которым решается, куда писать. */
export interface OutreachContact {
  email: string | null;
  whatsapp: string | null;
  phone: string;
  emailSentAt: Date | null;
  whatsappSentAt: Date | null;
  status: string;
}

/** Рассылка идёт только этим статусам: READY — ещё не писали, CONTACTED — второй канал. */
export const OUTREACH_STATUSES: readonly string[] = ['READY', 'CONTACTED'];

/** Последняя строка каждого сообщения (R18a). */
export const STOP_LINE = 'Если не нужно — ответьте «стоп», больше не напишем.';

const EMAIL_ONCE_LINE = 'Письмо отправлено один раз на адрес из открытой карточки компании.';
const WHATSAPP_ONCE_LINE = 'Сообщение отправлено один раз на номер из открытой карточки компании.';
const FOLLOW_UP_ONCE_LINE = 'Это единственное напоминание.';

/** Страница услуги «Сайт под ключ» (S2): на неё ведут письма, WhatsApp и подвал клиентских сайтов. */
export const SERVICE_PATH = SERVICE_PAGE_PATH;

/** Подпись ссылки на страницу услуги в письмах и WhatsApp (S12). */
export const SERVICE_LINK_LABEL = 'Кто мы и цены';

/** Строка о форме заявки на сайте клиента (S4, S12): заявки уходят на почту компании. */
export const LEADS_TO_EMAIL_LINE = 'Заявки с сайта будут приходить вам на почту';

/**
 * Ссылка на страницу услуги с метками: канал (`utm_source`) и страница какой компании
 * привела человека (`utm_campaign` — адрес её страницы, не секрет превью).
 */
export function serviceUrl(baseUrl: string, source: OutreachChannel, slug: string): string {
  const query = new URLSearchParams({ utm_source: source, utm_campaign: slug });
  return `${baseUrl.replace(/\/+$/, '')}${SERVICE_PATH}?${query.toString()}`;
}

/**
 * Не длиннее этого — текст WhatsApp. 750, а не прежние 600: с S12 в сообщении для сайта ещё
 * ссылка «Кто мы и цены» (до 140 знаков с меткой) и строка о заявках на почту; длиннее —
 * сначала уходят необязательные строки (buildWhatsAppText).
 */
export const WHATSAPP_MAX_LENGTH = 750;

function where(p: Pick<PageProspect, 'city'>): string {
  const city = p.city?.trim();
  return city ? ` в городе ${city}` : '';
}

function promiseSentence(): string {
  return `${PLATFORM_PROMISE}: ${PLATFORM_PROMISE_DETAIL.charAt(0).toLowerCase()}${PLATFORM_PROMISE_DETAIL.slice(1)}`;
}

/** Российский мобильный номер (+79…): только на такой можно писать в WhatsApp. */
export function isRuMobile(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return /^79\d{9}$/.test(phoneDigits(phone));
}

interface Letter {
  subject: string;
  greeting: string;
  paragraphs: string[];
  button: string;
  /** Ссылки под кнопкой («Кто мы и цены»). */
  links: { label: string; url: string }[];
  closing: string[];
}

function serviceLinks(p: OutreachProspect, input: OutreachInput): Letter['links'] {
  return [{ label: SERVICE_LINK_LABEL, url: serviceUrl(input.baseUrl, 'email', p.slug) }];
}

function siteLetter(p: OutreachProspect, input: OutreachInput): Letter {
  const name = quotedName(p.name);
  const niche = input.nicheTitle.trim().toLowerCase();
  return {
    subject: `Сделали страницу для ${name} — посмотрите`,
    greeting: `Здравствуйте! Пишет ${SITE.name}, площадка ${SITE.platform}.`,
    paragraphs: [
      `Мы увидели вашу компанию ${name} на карте${where(p)}: ${niche}, есть телефон и адрес, ` +
        'а своей страницы в интернете нет. Поэтому мы уже сделали вам страницу-визитку по данным ' +
        'открытой карточки — посмотреть можно по ссылке ниже, страница пока закрыта от поисковиков.',
      'Что на странице: название, чем занимаетесь, услуги, адрес, часы работы, кнопки ' +
        '«Позвонить» и «Написать в WhatsApp», ссылка на карту и форма заявки. ' +
        `${LEADS_TO_EMAIL_LINE} — на этот адрес. Всё с вашей карточки, ничего не ` +
        'придумано; если что-то не так — поправим за день.',
      `Предложение: страница под ключ — ${rubles(input.prices.setup)} один раз, дальше поддержка ` +
        `${rubles(input.prices.monthly)} в месяц: правки, работа страницы, ответы на вопросы. ` +
        'Как согласуем — страница откроется по своему адресу в тот же день.',
    ],
    button: 'Открыть страницу',
    links: serviceLinks(p, input),
    closing: [
      `Если интересно — ответьте на это письмо или позвоните ${SITE.phone}.`,
      `${STOP_LINE} ${EMAIL_ONCE_LINE}`,
    ],
  };
}

function providerLetter(p: OutreachProspect, _input: OutreachInput): Letter {
  const name = quotedName(p.name);
  return {
    subject: `Ваша страница на ${SITE.platform} уже готова`,
    greeting: `Здравствуйте! Пишет ${SITE.name}, площадка ${SITE.platform}.`,
    paragraphs: [
      `${SITE.platform} — площадка заявок на спецтехнику по всей России. ${promiseSentence()}`,
      `Мы увидели вашу компанию ${name} на карте${where(p)} и уже сделали вам страницу ` +
        'исполнителя на площадке: название, город, ваша техника и кнопка «Заказать технику». ' +
        'Заказчики смогут заказывать у вас напрямую, заявка уходит сразу вам. Всё с вашей ' +
        'карточки, ничего не придумано; телефон покажем только с вашего согласия.',
      'Как встать на линию: откройте страницу по ссылке ниже и нажмите «Это моя компания» — ' +
        'регистрация за минуту прямо с телефона: имя, номер, вид техники. После этого вы видите ' +
        'заявки рядом с вами и сами называете цену.',
    ],
    button: 'Открыть мою страницу',
    links: [],
    closing: [
      `Вопросы — ответьте на это письмо или позвоните ${SITE.phone}.`,
      `${STOP_LINE} ${EMAIL_ONCE_LINE}`,
    ],
  };
}

function letterFor(p: OutreachProspect, input: OutreachInput): Letter {
  return p.kind === 'provider' ? providerLetter(p, input) : siteLetter(p, input);
}

/** Напоминание (S8): короче первого письма — что сделали, ссылка, «стоп». */
function followUpLetter(p: OutreachProspect, input: OutreachInput): Letter {
  const name = quotedName(p.name);
  const greeting = `Здравствуйте! Это снова ${SITE.name}, площадка ${SITE.platform}.`;
  const closing = (ask: string) => [
    `${ask} — ответьте на это письмо или позвоните ${SITE.phone}.`,
    `${STOP_LINE} ${FOLLOW_UP_ONCE_LINE}`,
  ];
  if (p.kind === 'provider') {
    return {
      subject: `Напоминаем: ваша страница на ${SITE.platform} готова`,
      greeting,
      paragraphs: [
        `Недавно мы писали вам: сделали для ${name} страницу исполнителя на площадке заявок на ` +
          'спецтехнику. Посмотрите — это 30 секунд. Чтобы получать заявки, нажмите на странице ' +
          '«Это моя компания».',
      ],
      button: 'Открыть мою страницу',
      links: [],
      closing: closing('Вопросы'),
    };
  }
  return {
    subject: `Напоминаем: страница для ${name} готова`,
    greeting,
    paragraphs: [
      `Недавно мы писали вам: сделали страницу для ${name} по данным открытой карточки ` +
        `компании. Посмотрите — это 30 секунд. ${LEADS_TO_EMAIL_LINE}.`,
    ],
    button: 'Открыть страницу',
    links: serviceLinks(p, input),
    closing: closing('Если интересно'),
  };
}

/** Простой HTML в одну колонку, без картинок: заголовок, абзацы, кнопка-ссылка. */
function renderHtml(letter: Letter, previewUrl: string): string {
  const href = escapeHtml(previewUrl);
  const paragraph = (text: string) => `<p style="margin:0 0 12px">${escapeHtml(text)}</p>`;
  return `<!doctype html>
<html lang="ru">
<body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:15px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(letter.subject)}</h1>
${paragraph(letter.greeting)}
${letter.paragraphs.map(paragraph).join('\n')}
<p style="margin:20px 0"><a href="${href}" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(letter.button)}</a></p>
<p style="margin:0 0 12px;color:#6b7280;font-size:13px">Или откройте ссылку: <a href="${href}">${href}</a></p>
${letter.links.map((link) => `<p style="margin:0 0 12px"><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>`).join('\n')}
${letter.closing.map(paragraph).join('\n')}
<p style="margin:24px 0 0;color:#6b7280;font-size:13px">${escapeHtml(`${SITE.name} · ${SITE.platform} · ${SITE.phone}`)}</p>
</div>
</body>
</html>`;
}

function renderText(letter: Letter, previewUrl: string): string {
  return [
    letter.greeting,
    '',
    ...letter.paragraphs.flatMap((text) => [text, '']),
    `${letter.button}: ${previewUrl}`,
    ...letter.links.map((link) => `${link.label}: ${link.url}`),
    '',
    ...letter.closing,
    '',
    `— ${SITE.name} · ${SITE.platform} · ${SITE.phone}`,
  ].join('\n');
}

function render(letter: Letter, previewUrl: string): OutreachEmail {
  return {
    subject: letter.subject,
    text: renderText(letter, previewUrl),
    html: renderHtml(letter, previewUrl),
  };
}

/** Письмо кандидату по виду агента: сайт-визитка или страница исполнителя. */
export function buildEmail(p: OutreachProspect, input: OutreachInput): OutreachEmail {
  return render(letterFor(p, input), input.previewUrl);
}

/**
 * Одно напоминание по почте (S8), если кандидат не ответил на первое письмо: что сделали,
 * ссылка на превью (и «Кто мы и цены» для сайта), строка «стоп» последней.
 */
export function buildFollowUpEmail(p: OutreachProspect, input: OutreachInput): OutreachEmail {
  return render(followUpLetter(p, input), input.previewUrl);
}

/**
 * Короткое сообщение WhatsApp (≤ WHATSAPP_MAX_LENGTH): те же смыслы, ссылка, строка «стоп»
 * последней. Для сайта — строка о заявках на почту и «Кто мы и цены».
 */
export function buildWhatsAppText(p: OutreachProspect, input: OutreachInput): string {
  const name = quotedName(p.name);
  const intro = `Здравствуйте! Это ${SITE.name}, площадка ${SITE.platform}.`;
  const reply = `Ответьте здесь или позвоните ${SITE.phone}.`;
  const stop = `${STOP_LINE} ${WHATSAPP_ONCE_LINE}`;
  if (p.kind === 'provider') {
    const body =
      `Увидели ${name} на карте${where(p)} и сделали вам страницу исполнителя на площадке ` +
      'заявок на спецтехнику по всей России: техника, город, кнопка «Заказать технику». ' +
      `${PLATFORM_PROMISE}. Заказчики смогут заказывать у вас напрямую. Посмотреть и встать на ` +
      `линию (кнопка «Это моя компания»): ${input.previewUrl}`;
    return firstThatFits([
      [intro, body, reply, stop],
      [intro, body, stop],
      [intro, body, STOP_LINE],
    ]);
  }
  const body =
    `Увидели ${name} на карте${where(p)} без сайта и сделали вам ` +
    `страницу-визитку по данным карточки: ${input.previewUrl} Страница под ключ — ` +
    `${rubles(input.prices.setup)} один раз, поддержка ${rubles(input.prices.monthly)} в месяц.`;
  // Без адреса почты в карточке пересылать заявки некуда — просим его в ответ.
  const leads = p.email?.trim()
    ? `${LEADS_TO_EMAIL_LINE}.`
    : `${LEADS_TO_EMAIL_LINE} — пришлите адрес в ответ.`;
  const service = `${SERVICE_LINK_LABEL}: ${serviceUrl(input.baseUrl, 'whatsapp', p.slug)}`;
  // A long company name or address: keep the preview link and the stop line whole; drop the
  // «once» note first, then the reply line, then the service link and the leads line.
  return firstThatFits([
    [intro, body, leads, service, reply, stop],
    [intro, body, leads, service, reply, STOP_LINE],
    [intro, body, leads, service, STOP_LINE],
    [intro, body, leads, STOP_LINE],
    [intro, body, STOP_LINE],
  ]);
}

/** Первый вариант не длиннее WHATSAPP_MAX_LENGTH, иначе самый короткий (последний). */
function firstThatFits(variants: readonly (readonly string[])[]): string {
  const texts = variants.map((parts) => parts.join('\n\n'));
  return texts.find((text) => text.length <= WHATSAPP_MAX_LENGTH) ?? texts[texts.length - 1]!;
}

/**
 * Куда писать кандидату: e-mail — адрес есть, канал настроен, ещё не писали;
 * WhatsApp — канал настроен, ещё не писали и есть номер WhatsApp из карточки или
 * (по настройке владельца) обычный мобильный. Только для READY / CONTACTED.
 */
export function pickChannels(p: OutreachContact, settings: OutreachSettings): OutreachChannel[] {
  if (!OUTREACH_STATUSES.includes(p.status)) return [];
  const channels: OutreachChannel[] = [];
  if (settings.channels.email && p.email && p.email.trim() && !p.emailSentAt)
    channels.push('email');
  if (settings.channels.whatsapp && !p.whatsappSentAt && whatsappTarget(p, settings)) {
    channels.push('whatsapp');
  }
  return channels;
}

/** Цифры номера для sendWhatsApp («79…»), или null, если писать некуда. */
export function whatsappTarget(
  p: Pick<OutreachContact, 'whatsapp' | 'phone'>,
  settings: Pick<OutreachSettings, 'whatsappToPhone'>,
): string | null {
  if (p.whatsapp && isRuMobile(p.whatsapp)) return phoneDigits(p.whatsapp);
  if (settings.whatsappToPhone && isRuMobile(p.phone)) return phoneDigits(p.phone);
  return null;
}

// «\b» в JavaScript знает только латиницу (tasks/lessons.md, п. 18): границы слов —
// явные, через просмотр назад/вперёд по русским и латинским буквам.
// Целые слова: «стоп», «stop»; начала слов, чтобы ловить формы: «не пишите / не пиши»,
// «отпишите / отпишитесь», «удалите / удалить».
const STOP_RE = /(?<![a-zа-я0-9])(?:(?:стоп|stop)(?![a-zа-я0-9])|не пиши|отпиши|удали)/i;

/** Ответ «стоп» в любом виде: «Стоп!», «stop», «не пишите мне», «отпишите нас», «удалите». */
export function isStopReply(text: string): boolean {
  return STOP_RE.test(text.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' '));
}
