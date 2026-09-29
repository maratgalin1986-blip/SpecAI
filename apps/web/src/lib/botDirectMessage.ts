import { extractPhone } from '@specai/shared';
import type { LeadData } from '@/lib/leadIntake';
import type { IngestResult } from '@/lib/ingest';

// A private message to the Telegram/WhatsApp bot is a person who wants to
// talk to us. When it is not an equipment request the importer can publish
// (a question about prices, "call me back", a short note) or the database is
// down, it becomes a "call me back" lead so it is never lost.

export interface DirectMessage {
  channel: 'telegram' | 'whatsapp';
  text: string;
  authorName?: string;
  /** Telegram @username. */
  username?: string;
  /** Phone shared by the messenger (Telegram contact, WhatsApp sender). */
  phone?: string;
  chatId: string | number;
}

/**
 * The message was already turned into an order (or is a retry of one): no
 * lead needed. Everything else — ignored, too short, or the import failed.
 */
export function needsLead(result: IngestResult | null): boolean {
  if (!result) return true;
  if (result.status === 'created') return false;
  return !(result.status === 'duplicate' && result.reason === 'same message');
}

export function directMessageLead(message: DirectMessage): LeadData {
  const label = message.channel === 'whatsapp' ? 'WhatsApp' : 'Telegram';
  const phone =
    message.phone ??
    extractPhone(message.text) ??
    (message.username ? `${label} ${message.username}` : `${label} chat ${message.chatId}`);
  return {
    name: (message.authorName || message.username || `Клиент из ${label}`).slice(0, 100),
    phone: phone.slice(0, 60),
    message: message.text.trim().slice(0, 1000) || null,
    source: `${message.channel}-dm`,
  };
}

/** The bot's answer after the message was handed over as a lead. */
export function leadReply(lead: LeadData, sitePhone: string, delivered: boolean): string {
  if (!delivered) {
    return `Не удалось передать сообщение. Пожалуйста, позвоните нам: ${sitePhone}`;
  }
  const hasPhone = /\d{10,}/.test(lead.phone.replace(/\D/g, ''));
  return hasPhone
    ? `Спасибо! Передали менеджеру, перезвоним на ${lead.phone}. Срочно — ${sitePhone}`
    : `Спасибо! Передали менеджеру, свяжемся с вами. Оставьте номер телефона, если удобнее ` +
        `созвониться, или звоните ${sitePhone}`;
}
