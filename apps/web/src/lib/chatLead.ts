import { findPhone } from '@/lib/dispatcher';
import { SITE } from '@/lib/site';

// A phone number typed into the site's AI chat is a callback request. It is
// caught before any AI call, in every mode, and saved only with the
// visitor's consent to personal-data processing (152-ФЗ). Pure functions.

export const CHAT_LEAD_SOURCE = 'agents-chat';

export const CHAT_CONSENT_NEEDED =
  'Вижу номер телефона. Чтобы передать его диспетчеру, отметьте согласие на обработку ' +
  `персональных данных под полем ввода и отправьте номер ещё раз. Или позвоните сами: ${SITE.phone}.`;

export type ChatLeadStep =
  { kind: 'none' } | { kind: 'consent'; phone: string } | { kind: 'lead'; phone: string };

/** What to do with the latest user message: nothing, ask for consent, or save a lead. */
export function chatLeadStep(lastUserText: string, consent: boolean | undefined): ChatLeadStep {
  const phone = findPhone(lastUserText);
  if (!phone) return { kind: 'none' };
  return consent === true ? { kind: 'lead', phone } : { kind: 'consent', phone };
}

export interface ChatLead {
  name: string;
  phone: string;
  message: string;
  source: string;
}

/** The lead row: everything the visitor wrote, cut to the API's 1000 characters. */
export function chatLeadRecord(input: {
  phone: string;
  userName?: string | null;
  userTexts: string[];
}): ChatLead {
  return {
    name: input.userName?.trim() || 'Имя не указано',
    phone: input.phone,
    message: `Из чата на сайте:\n${input.userTexts.join('\n')}`.slice(0, 1000),
    source: CHAT_LEAD_SOURCE,
  };
}
