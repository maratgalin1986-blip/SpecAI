import { Resend } from 'resend';

/**
 * Email-уведомления через Resend.
 *
 * Клиент создаётся лениво: без RESEND_API_KEY импорт модуля и сборка не падают,
 * а отправка просто пропускается с записью в лог. Любая ошибка отправки
 * логируется и никогда не ломает основной запрос.
 */

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export type SendEmailResult =
  | { skipped: true; reason: string }
  | { skipped: false; ok: true; id: string | null }
  | { skipped: false; ok: false; error: string };

let client: Resend | null = null;

export function getResendApiKey(): string | undefined {
  const key = process.env.RESEND_API_KEY;
  return key && key.trim() ? key.trim() : undefined;
}

export function getEmailFrom(): string | undefined {
  const from = process.env.EMAIL_FROM;
  return from && from.trim() ? from.trim() : undefined;
}

export function isEmailConfigured(): boolean {
  return getResendApiKey() !== undefined && getEmailFrom() !== undefined;
}

function getResend(apiKey: string): Resend {
  if (!client) {
    client = new Resend(apiKey);
  }
  return client;
}

/** Сбрасывает закешированный клиент (для тестов). */
export function resetEmailClient(): void {
  client = null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .map((address) => address.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    console.info('[email] skipped: no recipients', { subject: input.subject });
    return { skipped: true, reason: 'no recipients' };
  }

  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.info('[email] skipped: RESEND_API_KEY is not set', {
      to: recipients,
      subject: input.subject,
    });
    return { skipped: true, reason: 'RESEND_API_KEY is not set' };
  }

  const from = getEmailFrom();
  if (!from) {
    console.info('[email] skipped: EMAIL_FROM is not set', {
      to: recipients,
      subject: input.subject,
    });
    return { skipped: true, reason: 'EMAIL_FROM is not set' };
  }

  try {
    const { data, error } = await getResend(apiKey).emails.send({
      from,
      to: recipients,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) {
      console.error('[email] send failed', { to: recipients, subject: input.subject, error });
      return { skipped: false, ok: false, error: error.message };
    }
    return { skipped: false, ok: true, id: data?.id ?? null };
  } catch (error) {
    console.error('[email] send failed', { to: recipients, subject: input.subject, error });
    return {
      skipped: false,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
