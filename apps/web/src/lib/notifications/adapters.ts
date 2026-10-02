// Delivery adapters for notifications. Each one is switched on by env vars
// and returns a short result instead of throwing: a failed notification must
// never break the request that caused it.
//
//   Telegram  — TELEGRAM_BOT_TOKEN (the same bot that imports chat orders); free.
//   Push      — Expo push API (exp.host), no key needed; EXPO_ACCESS_TOKEN only
//               if "enhanced push security" is on in the Expo project.
//   E-mail    — Resend (RESEND_API_KEY + EMAIL_FROM), lib/email.ts.
//   WhatsApp  — Green API (GREEN_API_INSTANCE_ID + GREEN_API_TOKEN); paid, off by default.
//   SMS       — SMS.ru (SMSRU_API_ID); paid, off by default.
import { isEmailConfigured, sendEmail } from '../email';
import type { ServerChannels } from './routing';

export type DeliveryResult = { ok: true } | { ok: false; error: string; invalidTokens?: string[] };

const TIMEOUT_MS = 5000;

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function serverChannels(): ServerChannels {
  return {
    telegram: Boolean(env('TELEGRAM_BOT_TOKEN')),
    // The Expo push service needs no key; it is always available.
    push: true,
    email: isEmailConfigured(),
    whatsapp: Boolean(env('GREEN_API_INSTANCE_ID') && env('GREEN_API_TOKEN')),
    sms: Boolean(env('SMSRU_API_ID')),
  };
}

function failure(error: unknown): DeliveryResult {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<DeliveryResult> {
  const token = env('TELEGRAM_BOT_TOKEN');
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN is not set' };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.ok) return { ok: true };
    return { ok: false, error: `telegram ${response.status}` };
  } catch (error) {
    return failure(error);
  }
}

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** ExponentPushToken[...] / ExpoPushToken[...] — what expo-notifications returns. */
export function isExpoPushToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    token.length <= 200 &&
    /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(token)
  );
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Sends one notification to several devices. Tokens Expo reports as
 * DeviceNotRegistered come back in `invalidTokens` so the caller removes them.
 */
export async function sendExpoPush(
  tokens: string[],
  message: { title: string; body: string; data?: Record<string, string> },
): Promise<DeliveryResult> {
  const valid = tokens.filter(isExpoPushToken);
  if (valid.length === 0) return { ok: false, error: 'no push tokens' };
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const accessToken = env('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        valid.map((to) => ({
          to,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: 'default',
          priority: 'high',
        })),
      ),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, error: `expo push ${response.status}` };
    const payload = (await response.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
    const tickets = payload?.data ?? [];
    const invalidTokens = valid.filter(
      (_token, index) => tickets[index]?.details?.error === 'DeviceNotRegistered',
    );
    const delivered = tickets.some((ticket) => ticket.status === 'ok');
    if (delivered && invalidTokens.length === 0) return { ok: true };
    if (delivered) return { ok: false, error: 'some devices are gone', invalidTokens };
    return {
      ok: false,
      error: tickets[0]?.message ?? 'expo push rejected',
      invalidTokens,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function sendEmailNotification(
  to: string,
  template: { subject: string; html: string; text: string },
): Promise<DeliveryResult> {
  const result = await sendEmail({ to, ...template });
  if (result.skipped) return { ok: false, error: result.reason };
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Green API: https://green-api.com/docs/api/sending/SendMessage/ */
export async function sendWhatsApp(phoneDigits: string, text: string): Promise<DeliveryResult> {
  const instance = env('GREEN_API_INSTANCE_ID');
  const token = env('GREEN_API_TOKEN');
  if (!instance || !token) return { ok: false, error: 'Green API is not configured' };
  const base = (env('GREEN_API_URL') ?? 'https://api.green-api.com').replace(/\/+$/, '');
  try {
    const response = await fetch(`${base}/waInstance${instance}/sendMessage/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: `${phoneDigits}@c.us`, message: text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok ? { ok: true } : { ok: false, error: `green api ${response.status}` };
  } catch (error) {
    return failure(error);
  }
}

/** SMS.ru: https://sms.ru/api/send */
export async function sendSms(phoneDigits: string, text: string): Promise<DeliveryResult> {
  const apiId = env('SMSRU_API_ID');
  if (!apiId) return { ok: false, error: 'SMSRU_API_ID is not set' };
  const params = new URLSearchParams({ api_id: apiId, to: phoneDigits, msg: text, json: '1' });
  const from = env('SMSRU_FROM');
  if (from) params.set('from', from);
  try {
    const response = await fetch('https://sms.ru/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => null)) as { status?: string } | null;
    return response.ok && payload?.status === 'OK'
      ? { ok: true }
      : { ok: false, error: `sms.ru ${payload?.status ?? response.status}` };
  } catch (error) {
    return failure(error);
  }
}
