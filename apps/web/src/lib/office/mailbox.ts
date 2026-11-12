// Чтение ящика офиса по IMAP — тем же логином и паролем приложения, что и отправка (smtp.ts).
// Ящик — рабочая почта фирмы с сотнями посторонних писем, поэтому: папка «Входящие» открывается
// только на чтение (EXAMINE), письма не помечаются прочитанными, из списка берутся лишь отправитель,
// тема и служебные заголовки, а текст читается только у писем от тех, кому офис писал, и у отчётов
// о недоставке (решает lib/office/repliesRun.ts). Ничего из ящика не удаляется и не перемещается.
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { activeMailConfig, fallbackMailConfig, type OfficeMailConfig } from './smtp';

type Env = Record<string, string | undefined>;

export interface OfficeImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

const IMAP_HOST_BY_SMTP: Record<string, string> = {
  'smtp.yandex.ru': 'imap.yandex.ru',
  'smtp.mail.ru': 'imap.mail.ru',
  'smtp.gmail.com': 'imap.gmail.com',
};

/** Настройки чтения ящика; null — ящика нет или сервер чтения неизвестен. */
export function officeImapConfig(
  env: Env = process.env,
  mail: OfficeMailConfig | null = activeMailConfig(env),
): OfficeImapConfig | null {
  if (!mail) return null;
  const host = (env.OUTREACH_IMAP_HOST ?? '').trim() || IMAP_HOST_BY_SMTP[mail.host];
  if (!host) return null;
  return { host, port: 993, user: mail.user, pass: mail.pass };
}

/** Письмо из списка: без текста. */
export interface InboxMessage {
  uid: number;
  /** Адрес отправителя строчными буквами ('' — не разобран). */
  from: string;
  subject: string;
  messageId: string;
  /** Заголовок Auto-Submitted не «no» или Precedence bulk/junk/auto_reply: автоответ. */
  autoSubmitted: boolean;
}

export interface InboxSession {
  /** Метка «поколения» папки: сменилась — номера писем начались заново. */
  uidValidity: string;
  /** Номер, который получит следующее письмо. */
  uidNext: number;
  /** Письма с номером больше `afterUid`, по возрастанию, не больше `limit`. */
  list(afterUid: number, limit: number): Promise<InboxMessage[]>;
  /** Текст письма (plain, иначе HTML без разметки), не длиннее `MAIL_TEXT_MAX`. */
  text(uid: number): Promise<string>;
  close(): Promise<void>;
}

/** Сколько байт письма читаем и сколько знаков текста отдаём. */
export const MAIL_SOURCE_MAX = 64 * 1024;
export const MAIL_TEXT_MAX = 8_000;
/** Соединение и вход — не дольше этого. */
export const IMAP_TIMEOUT_MS = 8_000;

function headerValue(raw: Buffer | undefined, name: string): string {
  if (!raw) return '';
  const unfolded = raw.toString('utf8').replace(/\r?\n[ \t]+/g, ' ');
  const match = new RegExp(`^${name}:\\s*(.*)$`, 'im').exec(unfolded);
  return (match?.[1] ?? '').trim();
}

/** Открывает «Входящие» только на чтение; null — ящик не настроен. Ошибка входа — исключением. */
export async function openOfficeInbox(env: Env = process.env): Promise<InboxSession | null> {
  const config = officeImapConfig(env);
  if (!config) return null;
  try {
    return await openInbox(config);
  } catch (error) {
    // Как и при отправке (smtp.ts → fallbackMailConfig): логин из настроек отклонён — один раз
    // пробуем адрес площадки с сайта тем же паролем.
    const fallback = officeImapConfig(env, fallbackMailConfig(env));
    const refused = (error as { authenticationFailed?: boolean }).authenticationFailed === true;
    if (!refused || !fallback || fallback.user === config.user) throw error;
    return openInbox(fallback);
  }
}

async function openInbox(config: OfficeImapConfig): Promise<InboxSession> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    logger: false,
    connectionTimeout: IMAP_TIMEOUT_MS,
    greetingTimeout: IMAP_TIMEOUT_MS,
    socketTimeout: 20_000,
  });
  // Обрыв соединения после выхода не должен ронять функцию необработанным событием.
  client.on('error', () => undefined);
  await client.connect();
  const lock = await client.getMailboxLock('INBOX', { readOnly: true });
  const box = client.mailbox;
  const uidValidity = box && typeof box === 'object' ? String(box.uidValidity) : '';
  const uidNext = box && typeof box === 'object' ? Number(box.uidNext) : 0;
  return {
    uidValidity,
    uidNext,
    async list(afterUid, limit) {
      const out: InboxMessage[] = [];
      if (uidNext <= afterUid + 1) return out;
      const range = `${afterUid + 1}:${Math.min(uidNext - 1, afterUid + limit)}`;
      for await (const msg of client.fetch(
        range,
        { uid: true, envelope: true, headers: ['auto-submitted', 'precedence'] },
        { uid: true },
      )) {
        // «N:*» и диапазоны с дырами могут вернуть письмо вне границ — отсекаем.
        if (msg.uid <= afterUid) continue;
        const auto = headerValue(msg.headers, 'auto-submitted').toLowerCase();
        const precedence = headerValue(msg.headers, 'precedence').toLowerCase();
        out.push({
          uid: msg.uid,
          from: (msg.envelope?.from?.[0]?.address ?? '').trim().toLowerCase(),
          subject: (msg.envelope?.subject ?? '').trim(),
          messageId: (msg.envelope?.messageId ?? '').trim(),
          autoSubmitted:
            (auto !== '' && auto !== 'no') || /^(?:bulk|junk|auto_reply|list)$/.test(precedence),
        });
      }
      return out.sort((a, b) => a.uid - b.uid);
    },
    async text(uid) {
      const msg = await client.fetchOne(
        String(uid),
        { source: { start: 0, maxLength: MAIL_SOURCE_MAX } },
        { uid: true },
      );
      if (!msg || !msg.source) return '';
      const parsed = await simpleParser(msg.source, { skipImageLinks: true });
      const html = typeof parsed.html === 'string' ? parsed.html : '';
      const text =
        parsed.text?.trim() ||
        html
          .replace(/<(?:style|script)[\s\S]*?<\/(?:style|script)>/gi, ' ')
          .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
          .replace(/<[^>]+>/g, ' ');
      return text.slice(0, MAIL_TEXT_MAX);
    },
    async close() {
      lock.release();
      await client.logout().catch(() => undefined);
    },
  };
}
