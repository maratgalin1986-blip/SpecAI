import { z } from 'zod';
import type { RateLimitOptions } from './rateLimit';

/**
 * «Предложения и партнёрство» (owner, 2026-10-17): anyone can suggest an idea
 * about the service or offer a partnership. The form lives on /predlozheniya
 * and in the app; the owner reads the messages in the admin area and gets a
 * short note in Telegram. Pure helpers — used by the route, the admin page
 * and the form (client side), tested in proposals.test.ts.
 */

export const PROPOSAL_KINDS = ['IDEA', 'PARTNERSHIP'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const PROPOSAL_KIND_LABELS: Record<ProposalKind, string> = {
  IDEA: 'Идея или предложение по сервису',
  PARTNERSHIP: 'Сотрудничество и партнёрство',
};

/** Short badge text in the admin area. */
export const PROPOSAL_KIND_BADGES: Record<ProposalKind, string> = {
  IDEA: 'Идея',
  PARTNERSHIP: 'Партнёрство',
};

export const PROPOSAL_STATUSES = ['NEW', 'READ', 'ARCHIVED'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** Allowed status changes: «Прочитано» and «В архив»; nothing comes back from the archive. */
export const PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  NEW: ['READ', 'ARCHIVED'],
  READ: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canChangeProposalStatus(from: string, to: ProposalStatus): boolean {
  return (PROPOSAL_TRANSITIONS[from as ProposalStatus] ?? []).includes(to);
}

/** Fields the admin needs; the author's account id stays on the server. */
export const ADMIN_PROPOSAL_SELECT = {
  id: true,
  kind: true,
  name: true,
  contact: true,
  company: true,
  message: true,
  status: true,
  createdAt: true,
} as const;

export const PROPOSAL_SUCCESS = 'Спасибо! Мы прочитаем и ответим.';

/** 5 messages an hour from one IP and from one account. */
export const PROPOSAL_RATE_LIMIT: RateLimitOptions = { limit: 5, windowMs: 60 * 60 * 1000 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS_RE = /^[\d\s()+\-.]+$/;

export function isEmailContact(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function isPhoneContact(value: string): boolean {
  const trimmed = value.trim();
  if (!PHONE_CHARS_RE.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '').length;
  return digits >= 10 && digits <= 15;
}

const CONTACT_ERROR = 'Укажите телефон (от 10 цифр) или e-mail, чтобы мы могли ответить';

export const createProposalSchema = z.object({
  kind: z.enum(PROPOSAL_KINDS, { message: 'Выберите, что вы предлагаете' }),
  name: z
    .string({ message: 'Как к вам обращаться?' })
    .trim()
    .min(1, 'Как к вам обращаться?')
    .max(100, 'Имя — не длиннее 100 символов'),
  contact: z
    .string({ message: CONTACT_ERROR })
    .trim()
    .min(5, CONTACT_ERROR)
    .max(120, 'Контакт — не длиннее 120 символов')
    .refine((value) => isEmailContact(value) || isPhoneContact(value), CONTACT_ERROR),
  message: z
    .string({ message: 'Расскажите, что вы предлагаете' })
    .trim()
    .min(10, 'Расскажите подробнее — хотя бы пару предложений')
    .max(3000, 'Сообщение — не длиннее 3000 символов'),
  company: z
    .string()
    .trim()
    .max(200, 'Название компании — не длиннее 200 символов')
    .optional()
    .transform((value) => value || undefined),
  // Consent to personal data processing (152-ФЗ, /soglasie) is required.
  consent: z.literal(true, {
    errorMap: () => ({ message: 'Нужно согласие на обработку персональных данных' }),
  }),
  // Honeypot: real visitors never fill this hidden field (checked before the schema).
  website: z.string().max(0).optional(),
});
export type CreateProposalInput = z.input<typeof createProposalSchema>;
export type ProposalFields = Partial<Record<keyof CreateProposalInput, string>>;

/** The first message for each field, for errors under the inputs. */
export function proposalFieldErrors(error: z.ZodError): ProposalFields {
  const fields: ProposalFields = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in fields)) {
      fields[key as keyof CreateProposalInput] = issue.message;
    }
  }
  return fields;
}

/**
 * A bot filled the hidden field (any non-empty value, not only a string):
 * pretend success, save nothing — a 400 about the field would give the trap away.
 */
export function isProposalHoneypot(body: unknown): boolean {
  if (!body || typeof body !== 'object' || !('website' in body)) return false;
  const value = (body as { website: unknown }).website;
  return value !== undefined && value !== null && value !== '';
}

const PREVIEW_LENGTH = 300;

/**
 * The owner's Telegram note: kind, name, contact and the start of the message —
 * nothing else (no company, account id or IP); the rest is in the admin area.
 */
export function proposalTelegramText(
  proposal: { kind: ProposalKind; name: string; contact: string; message: string },
  adminUrl: string,
): string {
  // By code points: an emoji on the border is never cut in half.
  const chars = Array.from(proposal.message);
  const message =
    chars.length > PREVIEW_LENGTH
      ? `${chars.slice(0, PREVIEW_LENGTH).join('').trimEnd()}…`
      : proposal.message;
  const title = proposal.kind === 'PARTNERSHIP' ? '🤝 Сотрудничество' : '💡 Предложение';
  return [
    `${title}: ${PROPOSAL_KIND_LABELS[proposal.kind]}`,
    `Имя: ${proposal.name}`,
    `Контакт: ${proposal.contact}`,
    '',
    message,
    '',
    `Все предложения: ${adminUrl}`,
  ].join('\n');
}

/** tel: or mailto: for the admin's one-tap answer; null for anything else. */
export function proposalContactHref(contact: string): string | null {
  const value = contact.trim();
  if (isEmailContact(value)) return `mailto:${value}`;
  if (isPhoneContact(value)) return `tel:${value.replace(/[^\d+]/g, '')}`;
  return null;
}
