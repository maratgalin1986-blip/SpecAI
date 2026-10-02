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

const DRAFT_KEY = 'lead-draft';

/** The last lead that has not gone through yet (bad connection), if any. */
export function readLeadDraft(): Pick<LeadPayload, 'name' | 'phone' | 'message'> | null {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
  } catch {
    return null;
  }
}

function saveDraft(payload: LeadPayload | null) {
  try {
    if (payload) {
      const { name, phone, message } = payload;
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, phone, message }));
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  } catch {
    // Storage blocked: the form still works, only without a draft.
  }
}

/** Metrika's ClientID from the _ym_uid cookie, if the counter has set it. */
function readYmClientId(): string | undefined {
  try {
    const match = document.cookie.match(/(?:^|;\s*)_ym_uid=(\d{1,40})(?:;|$)/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

async function post(payload: LeadPayload) {
  return fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      source: withChannel(payload.source, currentChannel()),
      name: payload.name?.trim() || ANONYMOUS_LEAD_NAME,
      // The API takes up to 1000 characters; a long estimate must not fail the lead.
      message: payload.message ? payload.message.slice(0, 1000) : payload.message,
      website: payload.website ?? '',
      ymClientId: readYmClientId(),
    }),
  });
}

/**
 * Sends the lead. The form is kept as a draft until the server accepts it;
 * a network failure or a server error is retried once after 2 seconds.
 */
export async function submitLead(payload: LeadPayload): Promise<void> {
  saveDraft(payload);
  let response: Response | null = await post(payload).catch(() => null);
  if (!response || response.status >= 500) {
    reachGoal('lead_retry');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    response = await post(payload).catch(() => null);
  }
  if (!response) throw new Error('Нет связи с сервером');
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === 'string' ? body.error : 'Не удалось отправить');
  }
  saveDraft(null);
  reachGoal('lead');
}
