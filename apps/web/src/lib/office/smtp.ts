// Письма офиса со своего ящика (К1, docs/business/sajty-pod-klyuch.md, § 9.1): холодные
// письма кандидатам (первое и напоминание) уходят только по SMTP ящика, который владелец
// завёл под рассылку (Яндекс 360 по умолчанию), и никогда через Resend (lib/email.ts):
// правила Resend запрещают холодные письма, а с аккаунтом закрылась бы вся почта площадки.
// Нет SMTP — писем нет (причина «no-smtp»), строки кандидатов при этом не помечаются ошибкой.
import nodemailer from 'nodemailer';

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

function value(env: Env, key: string): string {
  return (env[key] ?? '').trim();
}

/** Настройки SMTP из переменных окружения; null — ящик не настроен. */
export function officeMailConfig(env: Env = process.env): OfficeMailConfig | null {
  const user = value(env, 'OUTREACH_SMTP_USER');
  const pass = env.OUTREACH_SMTP_PASS ?? '';
  if (!user || !pass.trim()) return null;
  const portText = value(env, 'OUTREACH_SMTP_PORT');
  const parsed = Number(portText);
  const port =
    portText && Number.isInteger(parsed) && parsed > 0 && parsed < 65_536
      ? parsed
      : DEFAULT_SMTP_PORT;
  return {
    host: value(env, 'OUTREACH_SMTP_HOST') || DEFAULT_SMTP_HOST,
    port,
    secure: port === 465,
    user,
    pass,
    from: value(env, 'OUTREACH_FROM') || user,
  };
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
    const transport = (deps.transport ?? defaultTransport)(config);
    await transport.sendMail({
      from: config.from,
      to,
      subject: clean(mail.subject),
      html: mail.html,
      text: mail.text,
      ...(replyTo ? { replyTo } : {}),
      ...(headers ? { headers } : {}),
    });
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
    const transport = (deps.transport ?? defaultTransport)(config);
    if (transport.verify) await transport.verify();
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
      to: config.user,
      subject: OFFICE_TEST_SUBJECT,
      html: `<p>${OFFICE_TEST_TEXT}</p>`,
      text: OFFICE_TEST_TEXT,
    },
    deps,
  );
}
