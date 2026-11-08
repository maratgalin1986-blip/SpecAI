/**
 * «Предложения и партнёрство» (владелец, 2026-10-17): идея по сервису или
 * предложение о сотрудничестве — POST /api/proposals. Проверки — те же, что
 * на сервере (apps/web/src/lib/proposals.ts), чтобы ошибки были видны под
 * полями до отправки. Чистые функции — проверяются тестами (proposals.test.ts).
 */

export type ProposalKind = 'IDEA' | 'PARTNERSHIP';

export const PROPOSAL_KINDS: { value: ProposalKind; title: string; hint: string }[] = [
  {
    value: 'IDEA',
    title: 'Идея или предложение по сервису',
    hint: 'Что сделать удобнее, чего не хватает, что мешает',
  },
  {
    value: 'PARTNERSHIP',
    title: 'Сотрудничество и партнёрство',
    hint: 'Совместная работа, поставки, реклама, интеграции',
  },
];

export const PROPOSAL_SUCCESS = 'Спасибо! Мы прочитаем и ответим.';

export interface ProposalForm {
  kind: ProposalKind;
  name: string;
  contact: string;
  company: string;
  message: string;
  consent: boolean;
}

export type ProposalErrors = Partial<Record<keyof ProposalForm, string>>;

const CONTACT_ERROR = 'Укажите телефон (от 10 цифр) или e-mail, чтобы мы могли ответить';

export function isEmailContact(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isPhoneContact(value: string): boolean {
  const trimmed = value.trim();
  if (!/^[\d\s()+\-.]+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '').length;
  return digits >= 10 && digits <= 15;
}

/** Ошибки под полями; пустой объект — можно отправлять. */
export function validateProposal(form: ProposalForm): ProposalErrors {
  const errors: ProposalErrors = {};
  const name = form.name.trim();
  const contact = form.contact.trim();
  const message = form.message.trim();
  if (!name) errors.name = 'Как к вам обращаться?';
  else if (name.length > 100) errors.name = 'Имя — не длиннее 100 символов';
  if (contact.length > 120) errors.contact = 'Контакт — не длиннее 120 символов';
  else if (contact.length < 5 || !(isEmailContact(contact) || isPhoneContact(contact))) {
    errors.contact = CONTACT_ERROR;
  }
  if (message.length < 10) errors.message = 'Расскажите подробнее — хотя бы пару предложений';
  else if (message.length > 3000) errors.message = 'Сообщение — не длиннее 3000 символов';
  if (form.company.trim().length > 200) {
    errors.company = 'Название компании — не длиннее 200 символов';
  }
  if (!form.consent) errors.consent = 'Нужно согласие на обработку персональных данных';
  return errors;
}

/** Тело запроса: обрезанные пробелы, компания — только если указана. */
export function proposalBody(form: ProposalForm) {
  const company = form.company.trim();
  return {
    kind: form.kind,
    name: form.name.trim(),
    contact: form.contact.trim(),
    message: form.message.trim(),
    ...(company ? { company } : {}),
    consent: true as const,
  };
}

/** Вошедший пользователь: имя и e-mail уже известны, их можно поменять. */
export function prefillProposal(
  user: { name?: string | null; email?: string | null } | null | undefined,
): Pick<ProposalForm, 'name' | 'contact'> {
  const email = user?.email?.trim() ?? '';
  return {
    name: user?.name?.trim() ?? '',
    // Технические адреса гостевых заказов («…invalid») для ответа не годятся.
    contact: email && !email.endsWith('.invalid') ? email : '',
  };
}

/** tel: или mailto: для ответа в одно касание; null — не телефон и не e-mail. */
export function proposalContactUrl(contact: string): string | null {
  const value = contact.trim();
  if (isEmailContact(value)) return `mailto:${value}`;
  if (isPhoneContact(value)) return `tel:${value.replace(/[^\d+]/g, '')}`;
  return null;
}

/** Короткая подпись вида на карточке администратора. */
export function proposalKindBadge(kind: string): string {
  return kind === 'PARTNERSHIP' ? 'Партнёрство' : 'Идея';
}

/** Ответ сервера с ошибками по полям (400): первая ошибка каждого поля. */
export function serverFieldErrors(details: unknown): ProposalErrors {
  if (!details || typeof details !== 'object' || !('fields' in details)) return {};
  const fields = (details as { fields: unknown }).fields;
  if (!fields || typeof fields !== 'object') return {};
  const errors: ProposalErrors = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string') errors[key as keyof ProposalForm] = value;
  }
  return errors;
}
