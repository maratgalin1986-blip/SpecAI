// Accepting a "call me back" lead (POST /api/leads): the lead is saved to the
// database and announced in Telegram. When the database is down the Telegram
// message still goes out, so the request reaches the owner instead of being
// lost; the visitor sees an error only when neither step worked.

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
  onSaveError?: (error: unknown) => void;
}

/** saved — in the database; notified-only — only in Telegram; lost — neither. */
export type LeadOutcome = 'saved' | 'notified-only' | 'lost';

export const UNSAVED_LEAD_WARNING =
  '⚠️ База сайта недоступна: заявка есть только в этом сообщении.';

export function leadMessage(lead: LeadData, siteName: string, saved: boolean): string {
  return [
    `📞 Новая заявка на звонок — ${siteName}`,
    `Имя: ${lead.name}`,
    `Телефон: ${lead.phone}`,
    lead.message ? `Сообщение: ${lead.message}` : null,
    lead.source ? `Откуда: ${lead.source}` : null,
    saved ? null : UNSAVED_LEAD_WARNING,
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
    deps.onSaveError?.(error);
  }
  const notified = await deps.notify(leadMessage(lead, deps.siteName, saved)).catch(() => false);
  if (saved) return 'saved';
  return notified ? 'notified-only' : 'lost';
}
