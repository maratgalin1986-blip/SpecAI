import { z } from 'zod';

export const leadStatusSchema = z.enum(['NEW', 'IN_PROGRESS', 'DONE']);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(100),
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
  // Honeypot: real visitors never fill this hidden field.
  website: z.string().max(0).optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
