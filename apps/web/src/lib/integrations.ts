import { createHash, timingSafeEqual } from 'node:crypto';

// Secrets for incoming messenger webhooks are derived from NEXTAUTH_SECRET, so
// the owner doesn't have to invent and store extra passwords: the admin page
// shows the ready-made values to paste into Telegram / Green API / n8n.

function derive(purpose: string) {
  const base = process.env.NEXTAUTH_SECRET;
  if (!base) return null;
  return createHash('sha256').update(`${purpose}:${base}`).digest('hex').slice(0, 40);
}

export const telegramWebhookSecret = () => derive('telegram-webhook');
export const whatsappWebhookToken = () => derive('whatsapp-webhook');
export const inboundApiToken = () => derive('inbound-api');

export function safeEqual(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Reads "Authorization: Bearer <token>" (also accepts the raw token). */
export function bearerToken(header: string | null) {
  if (!header) return null;
  return header.replace(/^Bearer\s+/i, '').trim();
}
