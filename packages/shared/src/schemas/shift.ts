import { z } from 'zod';

/**
 * Статусы смены машиниста (Яндекс Про: «На месте → Поехали → Завершить»):
 * Выехал → На объекте → Работа (идёт таймер) → Простой (с причиной, можно
 * вернуться в Работу) → Смена завершена. Строки, а не enum базы — список
 * может расти без ALTER TYPE (CLAUDE.md, правило 2).
 */
export const SHIFT_STATUSES = [
  'PLANNED',
  'EN_ROUTE',
  'ON_SITE',
  'WORKING',
  'IDLE',
  'FINISHED',
] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  PLANNED: 'Смена не начата',
  EN_ROUTE: 'Выехал',
  ON_SITE: 'На объекте',
  WORKING: 'Работа',
  IDLE: 'Простой',
  FINISHED: 'Смена завершена',
};

/** Какие статусы машинист может выбрать из текущего. */
export const SHIFT_TRANSITIONS: Record<ShiftStatus, readonly ShiftStatus[]> = {
  PLANNED: ['EN_ROUTE', 'ON_SITE'],
  EN_ROUTE: ['ON_SITE'],
  ON_SITE: ['WORKING', 'FINISHED'],
  WORKING: ['IDLE', 'FINISHED'],
  IDLE: ['WORKING', 'FINISHED'],
  FINISHED: [],
};

/** Подпись кнопки перехода («Выехал», «На объекте», «Начать работу»…). */
export const SHIFT_ACTION_LABELS: Record<ShiftStatus, string> = {
  PLANNED: 'Смена не начата',
  EN_ROUTE: 'Выехал',
  ON_SITE: 'На объекте',
  WORKING: 'Работа',
  IDLE: 'Простой',
  FINISHED: 'Завершить смену',
};

export const shiftStatusSchema = z.enum(SHIFT_STATUSES);

/** Смена переводится в новый статус; у простоя — причина, у начала и конца — фото. */
export const shiftTransitionSchema = z.object({
  status: shiftStatusSchema,
  note: z.string().trim().max(500, 'Причина слишком длинная (до 500 знаков)').optional(),
  photoUrl: z
    .string()
    .trim()
    .url('Некорректная ссылка на фото')
    .max(2000)
    .refine((url) => url.startsWith('https://'), 'Фото должно быть по https')
    .optional(),
});
export type ShiftTransitionInput = z.infer<typeof shiftTransitionSchema>;

export const createShiftSchema = z.object({
  bookingId: z.string().min(1).max(64),
  /** YYYY-MM-DD; без даты — сегодня (по Москве). */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате ГГГГ-ММ-ДД')
    .optional(),
});
export type CreateShiftInput = z.infer<typeof createShiftSchema>;

const hours = z.coerce
  .number({ invalid_type_error: 'Укажите часы числом' })
  .min(0, 'Часы не могут быть отрицательными')
  .max(24, 'В смене не больше 24 часов');

/** Табель смены: отработанные часы, простой и примечание. */
export const timesheetSubmitSchema = z.object({
  shiftId: z.string().min(1).max(64),
  hoursWorked: hours,
  idleHours: hours.default(0),
  note: z.string().trim().max(1000, 'Примечание слишком длинное (до 1000 знаков)').optional(),
});
export type TimesheetSubmitInput = z.infer<typeof timesheetSubmitSchema>;

export const TIMESHEET_ACTIONS = ['confirm', 'dispute'] as const;
export type TimesheetAction = (typeof TIMESHEET_ACTIONS)[number];

export const timesheetReviewSchema = z.object({
  action: z.enum(TIMESHEET_ACTIONS),
  note: z.string().trim().max(1000, 'Замечание слишком длинное (до 1000 знаков)').optional(),
});
export type TimesheetReviewInput = z.infer<typeof timesheetReviewSchema>;

const operatorFields = {
  name: z.string().trim().min(1, 'Укажите имя машиниста').max(200, 'Слишком длинное имя'),
  phone: z.string().trim().max(30, 'Слишком длинный телефон').optional(),
  licenseNumber: z.string().trim().max(60, 'Слишком длинный номер удостоверения').optional(),
  /** Вход в приложение: e-mail и временный пароль, которые выдаёт администратор. */
  email: z
    .string()
    .trim()
    .email('Проверьте e-mail машиниста')
    .max(254)
    .transform((value) => value.toLowerCase())
    .optional(),
  password: z
    .string()
    .min(8, 'Пароль — не короче 8 символов')
    .max(100, 'Пароль — не длиннее 100 символов')
    .optional(),
};

export const createOperatorSchema = z
  .object(operatorFields)
  .refine((data) => Boolean(data.email) === Boolean(data.password), {
    message: 'Для входа в приложение нужны и e-mail, и пароль',
    path: ['password'],
  });
export type CreateOperatorInput = z.infer<typeof createOperatorSchema>;

export const updateOperatorSchema = z
  .object({
    ...operatorFields,
    name: operatorFields.name.optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => !data.email || Boolean(data.password), {
    message: 'Для нового входа нужен и временный пароль',
    path: ['password'],
  });
export type UpdateOperatorInput = z.infer<typeof updateOperatorSchema>;

export const assignOperatorSchema = z.object({
  bookingId: z.string().min(1).max(64),
  /** null — снять машиниста с брони. */
  operatorId: z.string().min(1).max(64).nullable(),
});
export type AssignOperatorInput = z.infer<typeof assignOperatorSchema>;

/** Ручная блокировка дней машины («Не сдаётся»), обе даты включительно. */
export const createEquipmentBlockSchema = z
  .object({
    from: z.coerce.date({ errorMap: () => ({ message: 'Укажите дату начала' }) }),
    to: z.coerce.date({ errorMap: () => ({ message: 'Укажите дату окончания' }) }),
    reason: z.string().trim().max(200, 'Причина слишком длинная (до 200 знаков)').optional(),
  })
  .refine((data) => data.to.getTime() >= data.from.getTime(), {
    message: 'Дата окончания не может быть раньше даты начала',
    path: ['to'],
  });
export type CreateEquipmentBlockInput = z.infer<typeof createEquipmentBlockSchema>;
