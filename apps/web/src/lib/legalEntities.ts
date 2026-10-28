// Реквизиты заказчика (owner, 2026-10-28): несколько юрлиц и ИП на один
// аккаунт — «от кого заказываю» выбирается одним нажатием (isDefault).
import { z } from 'zod';
import { cleanInn, innLengthFor, isValidInn } from './inn';

export const LEGAL_ENTITIES_MAX = 10;

export const legalEntitySchema = z
  .object({
    legalForm: z.enum(['LEGAL', 'IP', 'SELF', 'PERSON'], {
      errorMap: () => ({ message: 'Выберите форму: юрлицо, ИП, самозанятый или физлицо' }),
    }),
    name: z.string().trim().min(2, 'Укажите название или ФИО').max(200),
    inn: z.string().transform(cleanInn),
    kpp: z
      .string()
      .optional()
      .transform((value) => (value ? value.replace(/\D/g, '') : null)),
    address: z
      .string()
      .trim()
      .max(300)
      .optional()
      .transform((value) => value || null),
  })
  .superRefine((value, ctx) => {
    const length = innLengthFor(value.legalForm);
    if (value.inn.length !== length) {
      ctx.addIssue({ code: 'custom', path: ['inn'], message: `ИНН — ${length} цифр` });
    } else if (!isValidInn(value.inn)) {
      ctx.addIssue({ code: 'custom', path: ['inn'], message: 'ИНН с ошибкой — проверьте цифры' });
    }
    if (value.kpp && value.kpp.length !== 9) {
      ctx.addIssue({ code: 'custom', path: ['kpp'], message: 'КПП — 9 цифр' });
    }
  });

export type LegalEntityInput = z.infer<typeof legalEntitySchema>;
