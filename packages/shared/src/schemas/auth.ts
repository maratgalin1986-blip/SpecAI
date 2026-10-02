import { z } from 'zod';

/**
 * E-mail в нормализованном виде: без пробелов по краям и в нижнем регистре.
 * Один и тот же адрес, набранный по-разному, должен приводить к одной записи User.
 */
export const emailSchema = z
  .string()
  .trim()
  .email('Проверьте e-mail: нужен адрес вида name@example.ru')
  .max(254, 'Слишком длинный e-mail')
  .transform((value) => value.toLowerCase());

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

const baseRegistration = {
  name: z.string().trim().min(1, 'Укажите имя').max(200, 'Слишком длинное имя'),
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Пароль — не короче 8 символов')
    .max(100, 'Пароль — не длиннее 100 символов'),
  phone: z.string().max(30, 'Слишком длинный телефон').optional(),
  /** Согласие на обработку персональных данных (152-ФЗ): без него аккаунт не создаётся. */
  consent: z.literal(true),
};

export const registerCustomerSchema = z.object({
  accountType: z.literal('CUSTOMER'),
  ...baseRegistration,
});
export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;

export const registerProviderSchema = z.object({
  accountType: z.literal('PROVIDER'),
  ...baseRegistration,
  companyName: z
    .string()
    .trim()
    .min(1, 'Укажите название компании')
    .max(200, 'Слишком длинное название компании'),
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
