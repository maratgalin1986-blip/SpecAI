// Posts a "call me back" lead to /api/leads. Shared by CallbackForm, the
// catalog quick order and the estimate box on the machine page. The visitor's
// marketing channel is appended to the source (see marketing.ts).

import { currentChannel, reachGoal, withChannel } from '@/lib/marketing';

export interface LeadPayload {
  name?: string;
  phone: string;
  message?: string;
  source: string;
  consent: boolean;
  /** Honeypot — always empty for people. */
  website?: string;
}

/** The API requires a name; short forms that don't ask for one send this. */
export const ANONYMOUS_LEAD_NAME = 'Имя не указано';

export async function submitLead(payload: LeadPayload): Promise<void> {
  const response = await fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      source: withChannel(payload.source, currentChannel()),
      name: payload.name?.trim() || ANONYMOUS_LEAD_NAME,
      website: payload.website ?? '',
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === 'string' ? body.error : 'Не удалось отправить');
  }
  reachGoal('lead');
}
