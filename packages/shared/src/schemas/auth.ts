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
  name: z
    .string({ required_error: 'Укажите имя', invalid_type_error: 'Укажите имя' })
    .trim()
    .min(1, 'Укажите имя')
    .max(200, 'Слишком длинное имя'),
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
  // Without `required_error` a missing field reports zod's English «Required»,
  // which the API replaces with a generic message.
  companyName: z
    .string({
      required_error: 'Укажите название компании',
      invalid_type_error: 'Укажите название компании',
    })
    .trim()
    .min(1, 'Укажите название компании')
    .max(200, 'Слишком длинное название компании'),
});
export type RegisterProviderInput = z.infer<typeof registerProviderSchema>;

/**
 * «Стать исполнителем» under the same login: a customer adds a company (and
 * the place its machinery stands, checked by the API like at sign-up) and
 * then switches between ordering and working in one account.
 */
export const becomeProviderSchema = z.object({
  companyName: registerProviderSchema.shape.companyName,
  phone: z.string().trim().max(30, 'Слишком длинный телефон').optional(),
  /** 152-ФЗ ст. 10.1: the provider's card (name, base, phone) is public. */
  publicConsent: z.literal(true, {
    errorMap: () => ({ message: 'Нужно согласие на публикацию карточки исполнителя' }),
  }),
});
export type BecomeProviderInput = z.infer<typeof becomeProviderSchema>;

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
