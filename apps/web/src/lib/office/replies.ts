// Ответы фирм на письма офиса (владелец, 2026-11-11: «сам читай ответные письма, отвечай на них и
// веди клиента, пока я не понадоблюсь»). Здесь — только разбор текста и тексты ответов, без почты
// и базы: чтение ящика — lib/office/mailbox.ts, применение — lib/office/repliesRun.ts.
//
// Офис отвечает сам только на понятные письма: «стоп» (снимаем с рассылки), вопрос о цене и
// интерес (цены, что входит, что дальше), согласие (подтверждаем и зовём владельца — счёт
// выставляет он). Всё остальное уходит владельцу в Telegram без ответа фирме: лучше промолчать,
// чем ответить невпопад. Ответ на входящее письмо — переписка, а не реклама, поэтому цены в нём
// уместны (в первом письме их нет — К6).

import { SITE } from '@/lib/site';
import { sitePackages } from '@/lib/prices';
import { isStopReply, LEGAL_SIGNATURE, serviceUrl, type OutreachInput } from './outreach';

export type ReplyKind = 'stop' | 'auto' | 'agree' | 'price' | 'interest' | 'other';

/** Сколько знаков ответа храним и показываем владельцу. */
export const REPLY_TEXT_MAX = 600;

// Строки, с которых начинается цитата прошлого письма.
const QUOTE_START = [
  /^\s*>/,
  /^\s*-{2,}\s*(?:original message|исходное сообщение|пересылаемое сообщение)/i,
  /^.{0,120}(?:писал\(а\)|написал\(а\)|написал|пишет|wrote):\s*$/i,
  /^\s*(?:от|from):\s.+@/i,
  /^\s*\d{1,2}[./]\d{1,2}[./]\d{2,4},?\s+\d{1,2}:\d{2}.{0,80}[<@]/,
  /^\s*(?:отправлено с|sent from)\s/i,
  // «ср, 11 нояб. 2026 г. в 18:04, Имя <адрес>:» — строка-шапка цитаты у Gmail и Яндекса.
  /^.{0,160}<[^<>\s]+@[^<>\s]+>:?\s*$/,
  /^.{0,120}\d{1,2}:\d{2}.{0,80}:\s*$/,
];

/** Верх письма без цитаты прошлого сообщения и подписи почтовой программы. */
export function replyTop(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    if (QUOTE_START.some((re) => re.test(line))) break;
    kept.push(line);
  }
  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, REPLY_TEXT_MAX);
}

function norm(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

const AUTO_SUBJECT = /автоответ|автоматическ|auto.?reply|out of office|вне офиса|в отпуске/i;
const AGREE_RE =
  /(?<![а-яa-z])(?:согласн|выставляйте|выставьте|пришлите счет|присылайте счет|вышлите счет|жд[уе]м? счет|готовы оплатить|оплатим|берем|подключайте|оформляйте|давайте делать|давайте оформ|заключ)/;
const PRICE_RE =
  /(?<![а-яa-z])(?:сколько|цен[аыу]|стоимост|стоит|прайс|расценк|тариф|почем|по чем|оплат|условия)/;
const INTEREST_RE =
  /(?<![а-яa-z])(?:интересн|подробн|расскажите|хотим|хочу|хотел|давайте|можно|нужен сайт|нужно|посмотрел|посмотрели|нравит|понравил|перезвоните|позвоните|свяжитесь|готов)/;
const NO_RE =
  /(?<![а-яa-z])(?:не интересн|неинтересн|не нужн|не надо|не требуется|отказ|уже есть|есть сайт|спам)/;

/**
 * Что это за письмо. `autoSubmitted` — заголовок Auto-Submitted не «no» или служебная рассылка:
 * автоответы не считаются ответом фирмы. Отказ словами («не интересно», «уже есть сайт») — это
 * 'stop': фирму снимаем с рассылки, как и по слову «стоп».
 */
export function classifyReply(input: {
  subject: string;
  text: string;
  autoSubmitted?: boolean;
}): ReplyKind {
  if (input.autoSubmitted || AUTO_SUBJECT.test(input.subject)) return 'auto';
  const top = norm(replyTop(input.text));
  if (!top) return 'other';
  if (isStopReply(top) || NO_RE.test(top)) return 'stop';
  if (AGREE_RE.test(top)) return 'agree';
  if (PRICE_RE.test(top)) return 'price';
  if (INTEREST_RE.test(top)) return 'interest';
  return 'other';
}

/**
 * Отчёт о недоставке: только от почтового робота (mailer-daemon, postmaster). По одной теме письма
 * не судим: иначе любой отправитель письмом «Undelivered…» со списком адресов закрыл бы фирмам
 * напоминания.
 */
export function isBounce(input: { from: string; subject: string }): boolean {
  return /^(?:mailer-daemon|postmaster)@/i.test(input.from.trim());
}

const ADDRESS_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;

/** Адреса, упомянутые в отчёте о недоставке (строчными, без повторов). */
export function addressesIn(text: string): string[] {
  return [...new Set((text.match(ADDRESS_RE) ?? []).map((a) => a.toLowerCase()))];
}

function rubles(value: number): string {
  return `${value.toLocaleString('ru-RU').replace(/[\u00a0\u202f]/g, ' ')} ₽`;
}

export interface ReplyAnswerInput {
  name: string;
  slug: string;
  previewUrl: string;
  baseUrl: string;
  prices: OutreachInput['prices'];
  /** Тема письма фирмы — ответ уходит с «Re:». */
  subject: string;
}

export interface ReplyAnswer {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function reSubject(subject: string): string {
  const clean = subject.replace(/[\r\n]+/g, ' ').trim();
  if (!clean) return `Re: страница для вашей компании на ${SITE.platform}`;
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

/**
 * Ответ офиса на письмо фирмы; null — на такое письмо офис сам не отвечает ('other', 'auto',
 * 'stop' — на «стоп» молчим: обещали больше не писать).
 */
export function buildReplyAnswer(kind: ReplyKind, input: ReplyAnswerInput): ReplyAnswer | null {
  if (kind !== 'price' && kind !== 'interest' && kind !== 'agree') return null;
  const packages = sitePackages(input.prices);
  const priceLines = packages.map(
    (p) =>
      `«${p.title}» — ${rubles(p.setup)} один раз, дальше поддержка ${rubles(p.monthly)} в месяц`,
  );
  const service = serviceUrl(input.baseUrl, 'email', input.slug);
  const paragraphs: string[] = [];
  const bullets: string[] = [];
  if (kind === 'agree') {
    paragraphs.push(
      'Спасибо, договорились! Подготовим счёт и пришлём его ответным письмом в течение рабочего дня.',
      'Чтобы счёт был оформлен на вашу компанию, пришлите, пожалуйста, реквизиты: название, ИНН и ' +
        'юридический адрес. Если что-то на странице нужно поправить до публикации — напишите, поправим.',
    );
  } else {
    paragraphs.push(
      'Спасибо за ответ! Коротко об условиях.',
      'Страница уже собрана по данным карточки вашей компании — посмотреть её можно по ссылке ниже. ' +
        'Если она вам подходит, мы публикуем её и дальше поддерживаем: правим тексты, услуги, часы и ' +
        'фото по вашей просьбе, заявки с сайта приходят вам на почту.',
    );
    bullets.push(...priceLines);
    paragraphs.push(
      'Оплата по счёту на расчётный счёт, договор — публичная оферта. До оплаты просмотр ни к чему ' +
        'не обязывает.',
      'Если подходит — ответьте на это письмо «да» и пришлите реквизиты (название, ИНН, адрес): ' +
        'подготовим счёт. Нужны правки на странице — напишите, что изменить.',
    );
  }
  const closing = `Вопросы — ответом на это письмо или по телефону ${SITE.phone}.`;
  const text = [
    'Здравствуйте!',
    '',
    paragraphs[0],
    '',
    paragraphs[1],
    '',
    ...(bullets.length ? [...bullets.map((b) => `• ${b}`), ''] : []),
    ...paragraphs.slice(2).flatMap((p) => [p, '']),
    `Ваша страница: ${input.previewUrl}`,
    `Кто мы и цены: ${service}`,
    '',
    closing,
    '',
    `— ${LEGAL_SIGNATURE}`,
  ].join('\n');
  const p = (t: string) => `<p style="margin:0 0 12px">${escapeHtml(t)}</p>`;
  const html = `<!doctype html>
<html lang="ru">
<body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:15px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
${p('Здравствуйте!')}
${paragraphs.slice(0, 2).map(p).join('\n')}
${bullets.length ? `<ul style="margin:0 0 12px;padding-left:20px">${bullets.map((b) => `<li style="margin:0 0 6px">${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
${paragraphs.slice(2).map(p).join('\n')}
<p style="margin:0 0 12px"><a href="${escapeHtml(input.previewUrl)}">Ваша страница</a> · <a href="${escapeHtml(service)}">Кто мы и цены</a></p>
${p(closing)}
<p style="margin:24px 0 0;color:#6b7280;font-size:13px">${escapeHtml(LEGAL_SIGNATURE)}</p>
</div>
</body>
</html>`;
  return { subject: reSubject(input.subject), text, html };
}

const KIND_TITLE: Record<ReplyKind, string> = {
  stop: 'отказ — сняли с рассылки',
  auto: 'автоответ',
  agree: 'СОГЛАСИЕ — нужен счёт',
  price: 'вопрос о цене',
  interest: 'интерес',
  other: 'письмо без понятного вопроса',
};

/** Строка владельцу в Telegram об ответе фирмы. */
export function replyNotice(input: {
  kind: ReplyKind;
  name: string;
  city: string | null;
  text: string;
  answered: boolean;
  adminUrl: string;
}): string {
  const action =
    input.kind === 'agree'
      ? input.answered
        ? 'Офис подтвердил и попросил реквизиты. Ваш шаг: «Согласился» в карточке и счёт.'
        : 'Ваш шаг: ответить, отметить «Согласился» и выставить счёт.'
      : input.kind === 'stop'
        ? 'Больше ему не пишем.'
        : input.answered
          ? 'Офис ответил сам: условия, цены и ссылка на страницу.'
          : 'Офис не ответил — посмотрите письмо в ящике и ответьте сами.';
  return [
    `✉️ Ответ на письмо офиса: ${input.name}${input.city ? `, ${input.city}` : ''} — ${KIND_TITLE[input.kind]}`,
    input.text ? `«${input.text.slice(0, 300)}»` : '',
    action,
    input.adminUrl,
  ]
    .filter(Boolean)
    .join('\n');
}
