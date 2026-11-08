// Полная регистрация и проверка исполнителя (owner, 2026-10-28).
// Исполнитель может начать по лёгкой форме (имя, телефон, вид техники) —
// компания `provisional`. После первого подтверждённого или выполненного
// заказа ему предлагают «Завершите регистрацию»: форма, ИНН, налоговый режим,
// СТС. Отправленная форма ждёт админа; «Проверен» (`verified`) ставит только
// админ. Функции чистые — их используют страницы, маршруты и тесты.

import { z } from 'zod';
import { cleanInn, innLengthFor, isValidInn } from './inn';

export const LEGAL_FORMS = [
  { id: 'LEGAL', label: 'Юрлицо (ООО, АО)' },
  { id: 'IP', label: 'ИП' },
  { id: 'SELF', label: 'Самозанятый' },
  { id: 'PERSON', label: 'Физлицо' },
] as const;
export type LegalForm = (typeof LEGAL_FORMS)[number]['id'];

export const TAX_REGIMES = [
  { id: 'OSNO_VAT', label: 'ОСНО с НДС' },
  { id: 'USN', label: 'УСН' },
  { id: 'NPD', label: 'НПД (самозанятый)' },
  { id: 'AUSN', label: 'АУСН' },
  { id: 'PATENT', label: 'Патент' },
] as const;
export type TaxRegime = (typeof TAX_REGIMES)[number]['id'];

/** Какие режимы бывают у формы: самозанятый — только НПД, физлицо — без режима. */
export const REGIMES_FOR: Record<LegalForm, readonly TaxRegime[]> = {
  LEGAL: ['OSNO_VAT', 'USN', 'AUSN'],
  IP: ['OSNO_VAT', 'USN', 'AUSN', 'PATENT', 'NPD'],
  SELF: ['NPD'],
  PERSON: [],
};

export function legalFormLabel(id: string | null | undefined): string | null {
  return LEGAL_FORMS.find((item) => item.id === id)?.label ?? null;
}
export function taxRegimeLabel(id: string | null | undefined): string | null {
  return TAX_REGIMES.find((item) => item.id === id)?.label ?? null;
}

export type VerificationStatus =
  | 'provisional' // лёгкий вход, ничего не отправлено
  | 'unverified' // полная регистрация без проверки (старые аккаунты)
  | 'pending' // отправлено на проверку
  | 'rejected' // админ вернул с причиной
  | 'verified';

export interface VerificationFields {
  verified: boolean;
  provisional?: boolean | null;
  verificationRequestedAt?: Date | string | null;
  verificationRejectedReason?: string | null;
}

export function verificationStatus(company: VerificationFields): VerificationStatus {
  if (company.verified) return 'verified';
  if (company.verificationRejectedReason) return 'rejected';
  if (company.verificationRequestedAt) return 'pending';
  return company.provisional ? 'provisional' : 'unverified';
}

export const VERIFICATION_STATUS_TEXT: Record<VerificationStatus, string> = {
  provisional: 'Новый исполнитель, данные не проверены',
  unverified: 'Данные не проверены',
  pending: 'Данные на проверке',
  rejected: 'Проверка не пройдена — исправьте данные',
  verified: 'Проверен',
};

/**
 * Что видит заказчик рядом с исполнителем: «Проверен» только после проверки
 * админом; лёгкий вход — честная пометка; остальным — ничего (как раньше).
 */
export function trustLabel(company: VerificationFields): 'Проверен' | string | null {
  const status = verificationStatus(company);
  if (status === 'verified') return 'Проверен';
  if (company.provisional) return VERIFICATION_STATUS_TEXT.provisional;
  return null;
}

/** Брони, после которых предлагаем полную регистрацию. */
export const FIRST_ORDER_STATUSES = ['CONFIRMED', 'ACTIVE', 'COMPLETED'] as const;

/**
 * Баннер «Завершите регистрацию»: после первого подтверждённого или
 * выполненного заказа, пока данные не отправлены или их вернули.
 */
export function shouldOfferFullRegistration(
  company: VerificationFields,
  confirmedOrders: number,
): boolean {
  const status = verificationStatus(company);
  if (status === 'rejected') return true;
  if (status !== 'provisional' && status !== 'unverified') return false;
  return confirmedOrders > 0;
}

/** Отправить на проверку можно из любого состояния, кроме «на проверке» и «проверен». */
export function canSubmitVerification(status: VerificationStatus): boolean {
  return status === 'provisional' || status === 'unverified' || status === 'rejected';
}

export type AdminDecision =
  | { action: 'approve' }
  | { action: 'reject'; reason: string }
  | {
      action: 'revoke';
    };

/** Разрешённые решения админа: одобрить/вернуть — только «на проверке», снять — только «проверен». */
export function canDecide(status: VerificationStatus, decision: AdminDecision['action']): boolean {
  if (decision === 'approve')
    return (
      status === 'pending' ||
      status === 'unverified' ||
      status === 'provisional' ||
      status === 'rejected'
    );
  if (decision === 'reject') return status === 'pending';
  return status === 'verified';
}

/** Поля компании после решения админа. */
export function decisionData(decision: AdminDecision, now: Date = new Date()) {
  if (decision.action === 'approve') {
    return {
      verified: true,
      provisional: false,
      verifiedAt: now,
      verificationRejectedReason: null,
    };
  }
  if (decision.action === 'reject') {
    return {
      verified: false,
      verificationRequestedAt: null,
      verificationRejectedReason: decision.reason,
    };
  }
  return { verified: false, verifiedAt: null };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

/** Форма «Завершите регистрацию». */
export const fullRegistrationSchema = z
  .object({
    legalForm: z.enum(['LEGAL', 'IP', 'SELF', 'PERSON'], {
      errorMap: () => ({ message: 'Выберите форму: юрлицо, ИП, самозанятый или физлицо' }),
    }),
    legalName: z.string().trim().min(2, 'Укажите название организации или ФИО').max(200),
    inn: z.string().transform(cleanInn),
    kpp: z
      .string()
      .optional()
      .transform((value) => (value ? value.replace(/\D/g, '') : null)),
    ogrn: z
      .string()
      .optional()
      .transform((value) => (value ? value.replace(/\D/g, '') : null)),
    taxRegime: z
      .enum(['OSNO_VAT', 'USN', 'NPD', 'AUSN', 'PATENT'])
      .optional()
      .nullable()
      .transform((value) => value ?? null),
    stsNumber: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, ' ').toUpperCase())
      .pipe(z.string().min(6, 'Укажите номер СТС').max(20, 'Номер СТС — до 20 знаков')),
    stsFileKey: z.string().trim().min(1, 'Загрузите фото СТС').max(300),
    stsEquipmentId: z.string().trim().max(40).optional().nullable(),
    bankName: optionalText(120),
    bankBik: z
      .string()
      .optional()
      .transform((value) => (value ? value.replace(/\D/g, '') : null)),
    bankAccount: z
      .string()
      .optional()
      .transform((value) => (value ? value.replace(/\D/g, '') : null)),
  })
  .superRefine((value, ctx) => {
    const length = innLengthFor(value.legalForm);
    if (value.inn.length !== length) {
      ctx.addIssue({
        code: 'custom',
        path: ['inn'],
        message: `ИНН ${value.legalForm === 'LEGAL' ? 'организации' : 'ИП и физлица'} — ${length} цифр`,
      });
    } else if (!isValidInn(value.inn)) {
      ctx.addIssue({ code: 'custom', path: ['inn'], message: 'ИНН с ошибкой — проверьте цифры' });
    }
    const allowed = REGIMES_FOR[value.legalForm];
    if (allowed.length > 0 && (!value.taxRegime || !allowed.includes(value.taxRegime))) {
      ctx.addIssue({
        code: 'custom',
        path: ['taxRegime'],
        message: 'Выберите налоговый режим, подходящий для этой формы',
      });
    }
    if (value.kpp && value.kpp.length !== 9) {
      ctx.addIssue({ code: 'custom', path: ['kpp'], message: 'КПП — 9 цифр' });
    }
    if (value.ogrn && value.ogrn.length !== 13 && value.ogrn.length !== 15) {
      ctx.addIssue({ code: 'custom', path: ['ogrn'], message: 'ОГРН — 13 цифр, ОГРНИП — 15' });
    }
    if (value.bankBik && value.bankBik.length !== 9) {
      ctx.addIssue({ code: 'custom', path: ['bankBik'], message: 'БИК — 9 цифр' });
    }
    if (value.bankAccount && value.bankAccount.length !== 20) {
      ctx.addIssue({ code: 'custom', path: ['bankAccount'], message: 'Расчётный счёт — 20 цифр' });
    }
  });

export type FullRegistration = z.infer<typeof fullRegistrationSchema>;

/** «40702810…1234» → «•••• 1234»: счёт в списках не показываем целиком. */
export function maskAccount(account: string | null | undefined): string | null {
  if (!account) return null;
  return `•••• ${account.slice(-4)}`;
}
