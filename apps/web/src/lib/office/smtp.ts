// Письма офиса со своего ящика (К1, docs/business/sajty-pod-klyuch.md, § 9.1): холодные
// письма кандидатам (первое и напоминание) уходят только по SMTP ящика, который владелец
// завёл под рассылку (Яндекс 360 по умолчанию), и никогда через Resend (lib/email.ts):
// правила Resend запрещают холодные письма, а с аккаунтом закрылась бы вся почта площадки.
// Нет SMTP — писем нет (причина «no-smtp»), строки кандидатов при этом не помечаются ошибкой.
import nodemailer from 'nodemailer';
import { SITE } from '@/lib/site';

export interface OfficeMailConfig {
  host: string;
  port: number;
  /** 465 — TLS с первого байта; другие порты — STARTTLS. */
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/** Ящик Яндекс 360, если владелец не указал другой сервер. */
export const DEFAULT_SMTP_HOST = 'smtp.yandex.ru';
export const DEFAULT_SMTP_PORT = 465;
/** Одно письмо не дольше этого — иначе функция крона не успеет записать отметку. */
export const SMTP_TIMEOUT_MS = 8_000;
/**
 * Соединение и приветствие сервера — быстрее общего предела: если до сервера не достучались
 * (не тот адрес или порт, порт закрыт), это видно как точный отказ «не отправлено», а не как
 * «сервер не подтвердил» по общему таймеру отправки.
 */
export const SMTP_CONNECT_TIMEOUT_MS = 5_000;

type Env = Record<string, string | undefined>;

/** Значение без невидимых знаков и без кавычек вокруг: так его нередко вставляют в Vercel. */
function unwrap(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/^["'«»]+|["'«»]+$/g, '')
    .trim();
}

function value(env: Env, key: string): string {
  return unwrap(env[key] ?? '');
}

/**
 * Серверы исходящей почты бесплатных ящиков — по домену логина, когда сервер не указан явно:
 * с логином на mail.ru сервер Яндекса отклонил бы любой пароль (535).
 */
const SMTP_HOST_BY_DOMAIN: Record<string, string> = {
  'yandex.ru': 'smtp.yandex.ru',
  'ya.ru': 'smtp.yandex.ru',
  'yandex.com': 'smtp.yandex.ru',
  'yandex.by': 'smtp.yandex.ru',
  'yandex.kz': 'smtp.yandex.ru',
  'mail.ru': 'smtp.mail.ru',
  'bk.ru': 'smtp.mail.ru',
  'list.ru': 'smtp.mail.ru',
  'inbox.ru': 'smtp.mail.ru',
  'internet.ru': 'smtp.mail.ru',
  'gmail.com': 'smtp.gmail.com',
};

/** Домен адреса строчными буквами; '' — это не адрес. */
function domainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return at > 0 && at < address.length - 1 ? address.slice(at + 1).toLowerCase() : '';
}

/** Адрес из «Имя <адрес>» или сам адрес. */
function addressOf(from: string): string {
  const match = /<([^<>]+)>/.exec(from);
  return (match?.[1] ?? from).trim();
}

/**
 * Отправитель письма: имя — из OUTREACH_FROM, адрес — всегда логин ящика. Яндекс и Mail.ru
 * отклоняют письмо с чужим адресом отправителя (553), а проверка входа этого не видит: отказ
 * пришёлся бы на первые фирмы. Логин без «@» оставляет значение как есть.
 */
function senderOf(from: string, user: string): string {
  if (!user.includes('@')) return from || user;
  const named = /^([^<>]*)</.exec(from);
  const name = unwrap(named?.[1] ?? (from.includes('@') ? '' : from));
  return name ? `${name} <${user}>` : user;
}

/**
 * Пароль без пробелов и переводов строк: пароли приложений (Яндекс, Mail.ru, Google) пробелов
 * не содержат, а при вставке в Vercel пробел в конце или «abcd efgh ijkl mnop» дают отказ 535.
 */
function cleanPass(raw: string): string {
  return unwrap(raw).replace(/\s+/g, '');
}

/** Настройки SMTP из переменных окружения; null — ящик не настроен. */
export function officeMailConfig(env: Env = process.env): OfficeMailConfig | null {
  const user = value(env, 'OUTREACH_SMTP_USER');
  const pass = cleanPass(env.OUTREACH_SMTP_PASS ?? '');
  if (!user || !pass) return null;
  const portText = value(env, 'OUTREACH_SMTP_PORT');
  const parsed = Number(portText);
  const port =
    portText && Number.isInteger(parsed) && parsed > 0 && parsed < 65_536
      ? parsed
      : DEFAULT_SMTP_PORT;
  return {
    host:
      value(env, 'OUTREACH_SMTP_HOST') || SMTP_HOST_BY_DOMAIN[domainOf(user)] || DEFAULT_SMTP_HOST,
    port,
    secure: port === 465,
    user,
    pass,
    from: senderOf(value(env, 'OUTREACH_FROM'), user),
  };
}

/**
 * Запасной логин — адрес площадки с сайта (SITE.email) на том же почтовом сервере. Нужен, когда
 * в OUTREACH_SMTP_USER записан другой адрес, чем тот, для которого владелец создал пароль
 * приложения (2026-11-11: логин на ya.ru, пароль от ящика на yandex.ru → отказ 535 на каждый
 * проход). null — запасного нет: адрес тот же или живёт на другом сервере.
 */
export function fallbackMailConfig(env: Env = process.env): OfficeMailConfig | null {
  const config = officeMailConfig(env);
  if (!config) return null;
  const alt = SITE.email.trim().toLowerCase();
  if (!alt || alt === config.user.toLowerCase()) return null;
  if (SMTP_HOST_BY_DOMAIN[domainOf(alt)] !== config.host) return null;
  return { ...config, user: alt, from: senderOf(value(env, 'OUTREACH_FROM'), alt) };
}

// Логин, под которым сервер принял вход после отказа основному (живёт, пока жива функция).
let acceptedLogin: string | null = null;

/** Для тестов: забыть, какой логин принял сервер. */
export function resetMailLogin(): void {
  acceptedLogin = null;
}

/** Настройки, с которыми офис сейчас ходит в ящик: основной логин или принятый запасной. */
export function activeMailConfig(env: Env = process.env): OfficeMailConfig | null {
  const fallback = fallbackMailConfig(env);
  return fallback && acceptedLogin === fallback.user ? fallback : officeMailConfig(env);
}

/** Отказ входа (а не письма): только он даёт право попробовать запасной логин. */
function isLoginRefusal(error: unknown): boolean {
  const e = error as { responseCode?: number; code?: string; message?: string };
  return e?.responseCode === 535 || e?.code === 'EAUTH' || /\b535\b/.test(e?.message ?? '');
}

/**
 * Выполняет действие с транспортом; на отказ входа основному логину один раз пробует запасной и,
 * если сервер его принял, запоминает его для следующих писем.
 */
async function withLogin<T>(
  deps: OfficeMailDeps,
  run: (transport: OfficeMailTransport, config: OfficeMailConfig) => Promise<T>,
): Promise<T> {
  const env = deps.env ?? process.env;
  const config = activeMailConfig(env)!;
  const make = deps.transport ?? defaultTransport;
  try {
    return await run(make(config), config);
  } catch (error) {
    const fallback = fallbackMailConfig(env);
    if (!fallback || fallback.user === config.user || !isLoginRefusal(error)) throw error;
    let result: T;
    try {
      result = await run(make(fallback), fallback);
    } catch {
      // Запасной тоже не подошёл: владельцу показываем отказ основного логина.
      throw error;
    }
    acceptedLogin = fallback.user;
    return result;
  }
}

/**
 * Признаки настроек ящика без самих значений — для разбора отказа входа (535) сессией, у которой
 * нет доступа к Vercel: какой сервер, на каком домене логин, совпадает ли адрес отправителя с
 * логином (иначе Яндекс ответит 553) и похож ли пароль на пароль приложения (16 строчных
 * латинских букв). Ни логина, ни пароля, ни его длины в строке нет.
 */
export function officeMailHint(env: Env = process.env): string {
  const config = officeMailConfig(env);
  if (!config) return 'no-smtp';
  const domain = domainOf(config.user);
  const asked = value(env, 'OUTREACH_FROM');
  const sameSender =
    !asked.includes('@') || addressOf(asked).toLowerCase() === config.user.toLowerCase();
  return [
    `host=${config.host}`,
    `login=${domain ? `@${domain}` : 'not-an-address'}`,
    `from=${sameSender ? 'login' : 'replaced-by-login'}`,
    `pass=${/^[a-z]{16}$/.test(config.pass) ? 'app-password' : 'other'}`,
    ...((env.OUTREACH_SMTP_PASS ?? '') !== config.pass ? ['pass-had-spaces'] : []),
    ...(fallbackMailConfig(env)
      ? [acceptedLogin ? 'site-address-login=accepted' : 'site-address-login=also-refused']
      : []),
  ].join(' ');
}

/** Есть ли ящик для писем офиса. */
export function officeMailConfigured(env: Env = process.env): boolean {
  return officeMailConfig(env) !== null;
}

export interface OfficeMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Дополнительные заголовки (List-Unsubscribe и т. п.). */
  headers?: Record<string, string>;
}

export type OfficeMailResult = { ok: true } | { ok: false; reason: string };

/** То, что нужно от транспорта nodemailer (подменяется в тестах). */
export interface OfficeMailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
    headers?: Record<string, string>;
  }): Promise<unknown>;
  /** Соединение и вход без отправки письма (у nodemailer есть; у заглушек может не быть). */
  verify?(): Promise<unknown>;
}

export interface OfficeMailDeps {
  env?: Env;
  transport?: (config: OfficeMailConfig) => OfficeMailTransport;
}

let cached: { key: string; transport: OfficeMailTransport } | null = null;

function defaultTransport(config: OfficeMailConfig): OfficeMailTransport {
  const key = `${config.host}:${config.port}:${config.user}:${config.pass}`;
  if (cached?.key === key) return cached.transport;
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: SMTP_CONNECT_TIMEOUT_MS,
    greetingTimeout: SMTP_CONNECT_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
  cached = { key, transport };
  return transport;
}

/** Адрес без переводов строк: в заголовки письма ничего не подставить. */
function clean(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Одно письмо офиса через SMTP ящика. Без настроек — `{ ok: false, reason: 'no-smtp' }`
 * (вызвавший код это знает и не пишет ошибку в строку кандидата). Ошибка сервера — текстом.
 */
export async function sendOfficeMail(
  mail: OfficeMail,
  deps: OfficeMailDeps = {},
): Promise<OfficeMailResult> {
  const config = officeMailConfig(deps.env ?? process.env);
  if (!config) return { ok: false, reason: 'no-smtp' };
  const to = clean(mail.to);
  if (!to || to.endsWith('.invalid')) return { ok: false, reason: 'Нет адреса получателя' };
  const replyTo = mail.replyTo ? clean(mail.replyTo) : '';
  const headers = mail.headers
    ? Object.fromEntries(Object.entries(mail.headers).map(([k, v]) => [clean(k), clean(v)]))
    : undefined;
  try {
    await withLogin(deps, (transport, active) =>
      transport.sendMail({
        from: active.from,
        to,
        subject: clean(mail.subject),
        html: mail.html,
        text: mail.text,
        ...(replyTo ? { replyTo } : {}),
        ...(headers ? { headers } : {}),
      }),
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Проверка ящика без письма: соединение и вход по паролю (nodemailer `verify`). Перед каждым
 * проходом рассылки — чтобы неверный пароль или закрытый порт остановили проход сразу, а не
 * пометили ошибкой десятки фирм. Транспорт без `verify` (заглушки тестов) считается рабочим.
 */
export async function verifyOfficeMail(deps: OfficeMailDeps = {}): Promise<OfficeMailResult> {
  const config = officeMailConfig(deps.env ?? process.env);
  if (!config) return { ok: false, reason: 'no-smtp' };
  try {
    await withLogin(deps, async (transport) => {
      if (transport.verify) await transport.verify();
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export const OFFICE_TEST_SUBJECT = 'Проверка ящика офиса ИИСтройка24';
const OFFICE_TEST_TEXT = 'Ящик офиса работает: письма компаниям будут уходить с этого адреса.';

/**
 * Проверочное письмо с ящика офиса самому себе (на пользователя SMTP): до первой рассылки
 * видно, что сервер принимает пароль и письмо доходит. Те же настройки и тот же предел
 * времени, что у sendOfficeMail; без настроек — причина 'no-smtp'.
 */
export async function sendOfficeTestMail(deps: OfficeMailDeps = {}): Promise<OfficeMailResult> {
  const config = officeMailConfig(deps.env ?? process.env);
  if (!config) return { ok: false, reason: 'no-smtp' };
  return sendOfficeMail(
    {
      to: (activeMailConfig(deps.env ?? process.env) ?? config).user,
      subject: OFFICE_TEST_SUBJECT,
      html: `<p>${OFFICE_TEST_TEXT}</p>`,
      text: OFFICE_TEST_TEXT,
    },
    deps,
  );
}
