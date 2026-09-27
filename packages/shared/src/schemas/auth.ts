import { z } from 'zod';

/**
 * E-mail в нормализованном виде: без пробелов по краям и в нижнем регистре.
 * Один и тот же адрес, набранный по-разному, должен приводить к одной записи User.
 */
export const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

const baseRegistration = {
  name: z.string().min(1).max(200),
  email: emailSchema,
  password: z.string().min(8).max(100),
  phone: z.string().max(30).optional(),
};

export const registerCustomerSchema = z.object({
  accountType: z.literal('CUSTOMER'),
  ...baseRegistration,
});
export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;

export const registerProviderSchema = z.object({
  accountType: z.literal('PROVIDER'),
  ...baseRegistration,
  companyName: z.string().min(1).max(200),
});
export type RegisterProviderInput = z.infer<typeof registerProviderSchema>;

export const registerSchema = z.discriminatedUnion('accountType', [
  registerCustomerSchema,
  registerProviderSchema,
]);
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(100),
});
export type LoginInput = z.infer<typeof loginSchema>;
