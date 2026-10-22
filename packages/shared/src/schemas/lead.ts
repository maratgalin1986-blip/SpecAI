import { z } from 'zod';

export const leadStatusSchema = z.enum(['NEW', 'IN_PROGRESS', 'DONE']);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const leadOutcomeSchema = z.enum(['deal', 'no_deal', 'no_answer']);
export type LeadOutcome = z.infer<typeof leadOutcomeSchema>;

// What the owner edits in the CRM (/admin/leads): PATCH /api/admin/leads/[id].
// Every field is optional; null clears it. callAt is an ISO date-time.
export const leadCrmPatchSchema = z
  .object({
    status: leadStatusSchema,
    outcome: leadOutcomeSchema.nullable(),
    amount: z.number().int().min(0).max(1_000_000_000).nullable(),
    note: z.string().trim().max(2000).nullable(),
    city: z.string().trim().max(80).nullable(),
    callAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .transform((value) => (value === null ? null : new Date(value))),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Нечего менять');
export type LeadCrmPatch = z.infer<typeof leadCrmPatchSchema>;

export const createLeadSchema = z.object({
  // Optional: only the phone and the consent are required. No name is kept
  // as «Имя не указано», the same placeholder the site's short forms send.
  name: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || 'Имя не указано'),
  // Accepts any common formatting; must contain 10–15 digits.
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((value) => {
      const digits = value.replace(/\D/g, '').length;
      return digits >= 10 && digits <= 15;
    }, 'Укажите телефон полностью'),
  message: z.string().trim().max(1000).optional(),
  source: z.string().trim().max(100).optional(),
  // Consent to personal data processing (152-ФЗ) is required.
  consent: z.literal(true),
  // Yandex Metrika ClientID (the _ym_uid cookie), digits only.
  ymClientId: z.string().max(40).regex(/^\d+$/).optional(),
  // Honeypot: real visitors never fill this hidden field.
  website: z.string().max(0).optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
