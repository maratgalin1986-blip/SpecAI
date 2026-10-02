// Accepting a "call me back" lead (POST /api/leads, the messenger bots): the
// lead is saved to the database and announced in Telegram. When the database
// is down the Telegram message still goes out, so the request reaches the
// owner instead of being lost; the visitor sees an error only when neither
// step worked.
//
// Localisation (152-ФЗ): personal data is first recorded in the database. When
// that fails, Telegram gets only the phone number, without the name and the
// message; the full lead goes to the server log (onSaveError) for recovery.

export interface LeadData {
  name: string;
  phone: string;
  message: string | null;
  source: string | null;
}

export interface LeadIntakeDeps {
  save: (lead: LeadData) => Promise<unknown>;
  /** Resolves to true when the message was delivered. */
  notify: (text: string) => Promise<boolean>;
  siteName: string;
  /** Extra line for the saved-lead message (e.g. the photo link). */
  footer?: string;
  onSaveError?: (error: unknown, lead: LeadData) => void;
}

/** saved — in the database; notified-only — only in Telegram; lost — neither. */
export type LeadOutcome = 'saved' | 'notified-only' | 'lost';

/** The database-down notice: the phone only, the rest stays off the messenger. */
export function unsavedLeadMessage(phone: string): string {
  return `⚠️ Новая заявка, база недоступна: телефон ${phone}. Перезвоните; имя и текст — в журнале сервера (Vercel → Logs), в /admin заявки не будет.`;
}

export function leadMessage(
  lead: LeadData,
  siteName: string,
  saved: boolean,
  footer?: string,
): string {
  if (!saved) return unsavedLeadMessage(lead.phone);
  return [
    `📞 Новая заявка на звонок — ${siteName}`,
    `Имя: ${lead.name}`,
    `Телефон: ${lead.phone}`,
    lead.message ? `Сообщение: ${lead.message}` : null,
    lead.source ? `Откуда: ${lead.source}` : null,
    footer ?? null,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function acceptLead(lead: LeadData, deps: LeadIntakeDeps): Promise<LeadOutcome> {
  let saved = true;
  try {
    await deps.save(lead);
  } catch (error) {
    saved = false;
    deps.onSaveError?.(error, lead);
  }
  const notified = await deps
    .notify(leadMessage(lead, deps.siteName, saved, deps.footer))
    .catch(() => false);
  if (saved) return 'saved';
  return notified ? 'notified-only' : 'lost';
}
