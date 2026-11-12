// Рассылка кандидатам офиса агентов (R18, решение владельца 2026-11-09): чистые
// шаблоны письма и сообщения WhatsApp и выбор каналов. Одно сообщение на компанию и
// канал; адресат — только контакт из открытой карточки компании; в каждом тексте —
// строка «ответьте «стоп»» (R18a). Без «лучшая цена / гарантируем / самые»
// (REVIEW § 5), без выдуманных цифр: числа — цены из настроек и посчитанные факты досье.
// «Сайты под ключ» (S8, S12): в письме и WhatsApp для сайта — ссылка «Кто мы и цены» на
// страницу услуги с метками и строка о заявках на почту; одно напоминание по почте.
// Персональное предложение (U2): если рассылка передала `offer` (offer.ts, при включённом
// ИИ — aiOffer.ts), письмо и WhatsApp для сайта строятся из него: тема, вступление, три
// пункта и рекомендованный пакет с ценой.
// Отписка (К3): если рассылка передала `unsubscribeUrl`, последней строкой письма идёт
// «Больше не писать: <ссылка>» (заголовок List-Unsubscribe ставит outreachRun.ts).
import { domainToUnicode } from 'node:url';
import { SERVICE_PAGE_PATH } from './clientSite';
import { quotedName } from './pages';
import { PLATFORM_PROMISE, PLATFORM_PROMISE_DETAIL } from '@specai/shared';
import { escapeHtml } from '@/lib/emailTemplates';
import { SITE } from '@/lib/site';
import { sitePackages } from '@/lib/prices';
import type { Offer } from './offer';
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
  /** Персональное предложение (U2) — только для сайта; без него — общее письмо. */
  offer?: Pick<Offer, 'subject' | 'opener' | 'bullets' | 'packageKey' | 'packageReason'>;
  /**
   * Презентация под фирму (/pokaz/<token>) и фраза «что сделаем именно вам» по её сфере
   * (pitch.ts): только для писем о сайте. С ними кнопка на обложке письма ведёт на презентацию.
   */
  showUrl?: string;
  pitchLine?: string;
  /** Ссылка «Больше не писать» (К3, unsubscribe.ts): в письме строкой и ссылкой внизу. */
  unsubscribeUrl?: string;
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

/** Подпись ссылки отписки в письмах офиса (К3). */
export const UNSUBSCRIBE_LABEL = 'Больше не писать';

/** Последняя строка каждого сообщения (R18a). */
export const STOP_LINE = 'Если не нужно — ответьте «стоп», больше не напишем.';

/** Первое письмо: откуда адрес и что будет дальше — одно напоминание, если не ответят (S8). */
const EMAIL_ONCE_LINE =
  'Адрес — из открытой карточки компании; если не ответите, напомним один раз, не больше.';
/** Письмо и сообщение — не оферта: условия на странице услуги (бизнес-план, § 8.10, § 9.4). */
export const NOT_OFFER_LINE = 'Письмо не является офертой: условия и цены — на странице услуги.';
/** Что это за страница: черновик, не официальный сайт (§ 8.10). */
const DRAFT_LINE =
  'Это черновик, а не официальный сайт: в поиске его нет, открывается только по ссылке.';
/**
 * Что предлагаем (владелец, 2026-11-12): лендинг — одна страница, дешевле; сайт — с разделами,
 * дороже; дальше сопровождение по подписке. Цен в первом письме нет (К6) — они на странице услуги.
 */
const NEXT_STEP_LINE =
  'Из этого черновика можем сделать лендинг — одну страницу, это дешевле, — или полноценный сайт ' +
  `с разделами, это дороже. Дальше по желанию ведём сайт по подписке: правки, продвижение, поддержка. ${NOT_OFFER_LINE}`;
/** Подпись: кто пишет (§ 9.1, п. 4). */
export const LEGAL_SIGNATURE = `${SITE.name} — ${SITE.legalName}, ИНН ${SITE.inn}, ОГРН ${SITE.ogrn}, ${SITE.legalAddress}. Телефон ${SITE.phone}.`;
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

/**
 * Приветствие от человека, а не от «площадки» (владелец, 2026-11-12): кто пишет, откуда и чем
 * занимается — одной фразой, как в обычном деловом письме.
 */
const GREETING = `Здравствуйте! Меня зовут ${SITE.contactPerson}, я из компании ${SITE.name} (${SITE.city}). У нас есть IT-направление: создаём сайты и лендинги для небольших компаний, продвигаем и ведём их.`;
/**
 * Письмо исполнителю спецтехники — другой проект (владелец, 2026-11-12: «это два разных
 * проекта»): площадка заявок. В письмах о сайтах площадка не упоминается.
 */
const PROVIDER_GREETING = `Здравствуйте! Меня зовут ${SITE.contactPerson}, я из компании ${SITE.name} (${SITE.city}) — мы ведём площадку заявок на спецтехнику ${SITE.platform}.`;
/** Подпись человека перед реквизитами. */
const PERSON_SIGNATURE = `С уважением, ${SITE.contactPerson}, ${SITE.name}`;

interface Letter {
  subject: string;
  greeting: string;
  paragraphs: string[];
  /** Пункты списком после абзацев (персональное предложение). */
  bullets?: string[];
  /** Абзацы после пунктов. */
  after?: string[];
  button: string;
  /** Ссылки под кнопкой («Кто мы и цены»). */
  links: { label: string; url: string }[];
  closing: string[];
}

function serviceLinks(p: OutreachProspect, input: OutreachInput): Letter['links'] {
  return [
    ...(input.showUrl ? [{ label: SHOW_LINK_LABEL, url: input.showUrl }] : []),
    { label: SERVICE_LINK_LABEL, url: serviceUrl(input.baseUrl, 'email', p.slug) },
  ];
}

/** Подпись ссылки на презентацию под фирму. */
export const SHOW_LINK_LABEL = 'Презентация для вашей компании';
/** Пример нашей работы — в презентации, там же вход в 3D-город (владелец, 2026-11-12). */
const SHOWCASE_LINE =
  'В презентации — пример нашей работы: площадка с мобильным приложением и 3D-городом, по которому можно прогуляться.';

/** Что сделаем именно этой фирме и где это посмотреть; без презентации — ничего. */
function pitchParagraphs(input: OutreachInput): string[] {
  if (!input.pitchLine) return [];
  return [input.showUrl ? `${input.pitchLine} ${SHOWCASE_LINE}` : input.pitchLine];
}

function siteLetter(p: OutreachProspect, input: OutreachInput): Letter {
  const name = quotedName(p.name);
  const niche = input.nicheTitle.trim().toLowerCase();
  return {
    subject: `Сделали страницу для ${name} — посмотрите`,
    greeting: GREETING,
    paragraphs: [
      `В открытой карточке компании ${name} на карте не указан сайт. Мы собрали по данным ` +
        `карточки черновик страницы (${niche}): посмотреть можно по ссылке ниже. ${DRAFT_LINE}`,
      // Превью показывает то, что есть в карточке; услуги — типовой список сферы; форма заявки
      // включается только после подключения (К10).
      'Что на странице: название, адрес, часы работы и телефон из карточки, кнопка «Позвонить» ' +
        'и ссылка на карту; список услуг — типовой для вашей сферы, поправим по вашим словам. ' +
        `После подключения добавим форму заявки: ${LEADS_TO_EMAIL_LINE.charAt(0).toLowerCase()}${LEADS_TO_EMAIL_LINE.slice(1)}.`,
      ...pitchParagraphs(input),
      NEXT_STEP_LINE,
    ],
    button: 'Открыть страницу',
    links: serviceLinks(p, input),
    closing: [
      `Если интересно — ответьте на это письмо или позвоните ${SITE.phone}.`,
      `${STOP_LINE} ${EMAIL_ONCE_LINE}`,
    ],
  };
}

/** «Сайт-визитка — 15 000 ₽ один раз, поддержка 1 500 ₽ в месяц» для рекомендованного пакета. */
export function packageLine(
  packageKey: Offer['packageKey'],
  prices: OutreachInput['prices'],
): string {
  const all = sitePackages(prices);
  const pkg = all.find((p) => p.key === packageKey) ?? all[0]!;
  return (
    `«${pkg.title}» — ${rubles(pkg.setup)} один раз, дальше поддержка ` +
    `${rubles(pkg.monthly)} в месяц`
  );
}

/** Письмо для сайта из персонального предложения (U2). */
function offerLetter(
  p: OutreachProspect,
  input: OutreachInput,
  offer: NonNullable<OutreachInput['offer']>,
): Letter {
  return {
    subject: offer.subject,
    greeting: GREETING,
    paragraphs: [
      `${offer.opener} Мы собрали по данным карточки черновик страницы — посмотреть можно по ` +
        `ссылке ниже. ${DRAFT_LINE}`,
      ...pitchParagraphs(input),
      'Что на странице:',
    ],
    bullets: offer.bullets,
    after: [NEXT_STEP_LINE],
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
    greeting: PROVIDER_GREETING,
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
  if (p.kind === 'provider') return providerLetter(p, input);
  return input.offer ? offerLetter(p, input, input.offer) : siteLetter(p, input);
}

/** Напоминание (S8): короче первого письма — что сделали, ссылка, «стоп». */
function followUpLetter(p: OutreachProspect, input: OutreachInput): Letter {
  const name = quotedName(p.name);
  const greeting =
    p.kind === 'provider'
      ? `Здравствуйте! Это снова ${SITE.contactPerson} из ${SITE.name}, площадка ${SITE.platform}.`
      : `Здравствуйте! Это снова ${SITE.contactPerson} из компании ${SITE.name}.`;
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
        `компании. Посмотрите — это 30 секунд. ${LEADS_TO_EMAIL_LINE} после подключения.`,
    ],
    button: 'Открыть страницу',
    links: serviceLinks(p, input),
    closing: closing('Если интересно'),
  };
}

/** Адрес для показа человеку: «иистройка24.рф/preview/…» вместо punycode (в href — как есть). */
export function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = domainToUnicode(parsed.hostname) || parsed.hostname;
    return `${host}${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return url;
  }
}

/** Что известно о фирме для «обложки» письма: из карточки, пустое не показывается. */
interface LetterCard {
  name: string;
  niche: string;
  city: string | null;
  address: string | null;
  hours: string | null;
  phone: string | null;
  /** Презентация под фирму: если есть, кнопка обложки ведёт на неё. */
  showUrl?: string;
}

const FONT = 'font-family:Arial,Helvetica,sans-serif';

/**
 * Письмо-презентация под фирму: сверху «обложка» её будущего сайта (название, сфера, город,
 * адрес, часы и телефон из карточки) с кнопкой, ниже — письмо от человека. Одна колонка,
 * таблицы и встроенные стили (почтовые программы другого не понимают), без картинок и внешних
 * файлов: такие письма реже уходят в спам и одинаково выглядят в Яндексе, Mail.ru и на телефоне.
 */
function renderHtml(
  letter: Letter,
  previewUrl: string,
  unsubscribeUrl?: string,
  card?: LetterCard,
): string {
  const href = escapeHtml(previewUrl);
  const shown = escapeHtml(displayUrl(previewUrl));
  const unsubscribe = unsubscribeUrl
    ? `<p style="margin:10px 0 0;color:#9ca3af;font-size:12px;line-height:1.5">${UNSUBSCRIBE_LABEL}: <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9ca3af">${escapeHtml(displayUrl(unsubscribeUrl))}</a></p>`
    : '';
  const paragraph = (text: string) =>
    `<p style="margin:0 0 14px;color:#1f2937;font-size:16px;line-height:1.6">${escapeHtml(text)}</p>`;
  const small = (text: string) =>
    `<p style="margin:0 0 8px;color:#9ca3af;font-size:12px;line-height:1.5">${escapeHtml(text)}</p>`;
  const button = (label: string, light: boolean, to: string = href) =>
    `<a href="${to}" style="display:inline-block;padding:14px 26px;background:${light ? '#ffffff' : '#0f766e'};color:${light ? '#0f3d3a' : '#ffffff'};text-decoration:none;border-radius:10px;font-size:16px;font-weight:bold;${FONT}">${escapeHtml(label)}</a>`;
  const facts = card
    ? [
        card.address ? `Адрес: ${card.address}` : '',
        card.hours ? `Часы работы: ${card.hours}` : '',
        card.phone ? `Телефон: ${card.phone}` : '',
      ].filter(Boolean)
    : [];
  const cover = card
    ? `<tr><td style="background:#0f3d3a;border-radius:16px 16px 0 0;padding:32px 28px 28px;${FONT}">
<p style="margin:0 0 10px;color:#99f6e4;font-size:12px;letter-spacing:1.5px;text-transform:uppercase">Черновик сайта для вашей компании</p>
<p style="margin:0 0 8px;color:#ffffff;font-size:28px;line-height:1.2;font-weight:bold">${escapeHtml(card.name)}</p>
<p style="margin:0 0 18px;color:#ccfbf1;font-size:15px;line-height:1.5">${escapeHtml([card.niche, card.city].filter(Boolean).join(' · '))}</p>
${facts.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;width:100%;background:#134e4a;border-radius:10px"><tr><td style="padding:14px 16px;${FONT}">${facts.map((f) => `<p style="margin:0 0 4px;color:#e6fffb;font-size:14px;line-height:1.5">${escapeHtml(f)}</p>`).join('')}</td></tr></table>` : ''}
${card.showUrl ? button('Смотреть презентацию', true, escapeHtml(card.showUrl)) : button(letter.button, true)}
</td></tr>`
    : '';
  // Строки закона и отписки — мелко в подвале: они обязательны, но это не текст письма.
  const legal = letter.closing.slice(1);
  return `<!doctype html>
<html lang="ru">
<body style="margin:0;padding:0;background:#f3f4f6">
<div style="display:none;max-height:0;overflow:hidden;color:#f3f4f6;font-size:1px">${escapeHtml(letter.paragraphs[0] ?? letter.greeting)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f3f4f6"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px">
${cover}
<tr><td style="background:#ffffff;${card ? 'border-radius:0 0 16px 16px' : 'border-radius:16px'};padding:28px;${FONT}">
${paragraph(letter.greeting)}
${letter.paragraphs.map(paragraph).join('\n')}
${letter.bullets?.length ? `<ul style="margin:0 0 14px;padding-left:20px;color:#1f2937;font-size:16px;line-height:1.6">${letter.bullets.map((b) => `<li style="margin:0 0 6px">${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
${(letter.after ?? []).map(paragraph).join('\n')}
<p style="margin:22px 0 10px">${button(letter.button, false)}</p>
<p style="margin:0 0 18px;color:#6b7280;font-size:13px;line-height:1.5">Или откройте ссылку: <a href="${href}" style="color:#0f766e">${shown}</a></p>
${letter.links.map((link) => `<p style="margin:0 0 14px;font-size:15px"><a href="${escapeHtml(link.url)}" style="color:#0f766e">${escapeHtml(link.label)}</a></p>`).join('\n')}
${letter.closing[0] ? paragraph(letter.closing[0]) : ''}
${paragraph(PERSON_SIGNATURE)}
</td></tr>
<tr><td style="padding:18px 28px 8px;${FONT}">
${legal.map(small).join('\n')}
${small(LEGAL_SIGNATURE)}
${unsubscribe}
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}

function renderText(letter: Letter, previewUrl: string, unsubscribeUrl?: string): string {
  return [
    letter.greeting,
    '',
    ...letter.paragraphs.flatMap((text) => [text, '']),
    ...(letter.bullets?.length ? [...letter.bullets.map((b) => `• ${b}`), ''] : []),
    ...(letter.after ?? []).flatMap((text) => [text, '']),
    `${letter.button}: ${previewUrl}`,
    ...letter.links.map((link) => `${link.label}: ${link.url}`),
    '',
    ...letter.closing,
    '',
    `— ${LEGAL_SIGNATURE}`,
    ...(unsubscribeUrl ? ['', `${UNSUBSCRIBE_LABEL}: ${unsubscribeUrl}`] : []),
  ].join('\n');
}

function render(letter: Letter, input: OutreachInput, card?: LetterCard): OutreachEmail {
  return {
    subject: letter.subject,
    text: renderText(letter, input.previewUrl, input.unsubscribeUrl),
    html: renderHtml(letter, input.previewUrl, input.unsubscribeUrl, card),
  };
}

function cardOf(p: OutreachProspect, input: OutreachInput): LetterCard {
  return {
    name: p.name,
    niche: input.nicheTitle.trim(),
    city: p.city?.trim() || null,
    address: p.address?.trim() || null,
    hours: p.hours?.trim() || null,
    phone: p.phone?.trim() || null,
    ...(p.kind !== 'provider' && input.showUrl ? { showUrl: input.showUrl } : {}),
  };
}

/** Письмо кандидату по виду агента: сайт-визитка или страница исполнителя. */
export function buildEmail(p: OutreachProspect, input: OutreachInput): OutreachEmail {
  return render(letterFor(p, input), input, cardOf(p, input));
}

/**
 * Одно напоминание по почте (S8), если кандидат не ответил на первое письмо: что сделали,
 * ссылка на превью (и «Кто мы и цены» для сайта), строка «стоп» последней.
 */
export function buildFollowUpEmail(p: OutreachProspect, input: OutreachInput): OutreachEmail {
  return render(followUpLetter(p, input), input, cardOf(p, input));
}

/**
 * Короткое сообщение WhatsApp (≤ WHATSAPP_MAX_LENGTH): те же смыслы, ссылка, строка «стоп»
 * последней. Для сайта — строка о заявках на почту и «Кто мы и цены».
 */
export function buildWhatsAppText(p: OutreachProspect, input: OutreachInput): string {
  const name = quotedName(p.name);
  const intro =
    p.kind === 'provider'
      ? `Здравствуйте! Это ${SITE.name}, площадка ${SITE.platform}.`
      : `Здравствуйте! Это ${SITE.contactPerson} из компании ${SITE.name}, мы делаем сайты.`;
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
  if (input.offer) return offerWhatsAppText(p, input, input.offer);
  const body =
    `В открытой карточке ${name} на карте не указан сайт — собрали вам ` +
    `черновик страницы по данным карточки: ${input.previewUrl} Это не официальный сайт, в поиске его нет.`;
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

/**
 * WhatsApp для сайта из персонального предложения (U2): вступление, ссылка, пункты, пакет с
 * ценой. Длинное — сначала уходят строка «один раз», ответ, пункты, «Кто мы и цены», заявки;
 * ссылка на превью, цена и «стоп» (последней) остаются всегда.
 */
function offerWhatsAppText(
  p: OutreachProspect,
  input: OutreachInput,
  offer: NonNullable<OutreachInput['offer']>,
): string {
  const intro = `Здравствуйте! Это ${SITE.contactPerson} из компании ${SITE.name}, мы делаем сайты.`;
  const body = `${offer.opener} Собрали по данным карточки черновик страницы: ${input.previewUrl} Это не официальный сайт, в поиске его нет.`;
  const bullets = offer.bullets.map((b) => `• ${b}`).join('\n');
  const price = 'Условия и цены — по ссылке ниже; сообщение не является офертой.';
  const leads = p.email?.trim()
    ? `${LEADS_TO_EMAIL_LINE}.`
    : `${LEADS_TO_EMAIL_LINE} — пришлите адрес в ответ.`;
  const service = `${SERVICE_LINK_LABEL}: ${serviceUrl(input.baseUrl, 'whatsapp', p.slug)}`;
  const reply = `Ответьте здесь или позвоните ${SITE.phone}.`;
  const stop = `${STOP_LINE} ${WHATSAPP_ONCE_LINE}`;
  return firstThatFits([
    [intro, body, bullets, price, leads, service, reply, stop],
    [intro, body, bullets, price, leads, service, reply, STOP_LINE],
    [intro, body, bullets, price, leads, service, STOP_LINE],
    [intro, body, price, leads, service, STOP_LINE],
    [intro, body, price, leads, STOP_LINE],
    [intro, body, price, STOP_LINE],
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
