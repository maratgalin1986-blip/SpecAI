import { z } from 'zod';

export const equipmentStatusSchema = z.enum(['AVAILABLE', 'RENTED', 'IN_MAINTENANCE', 'RETIRED']);
export type EquipmentStatus = z.infer<typeof equipmentStatusSchema>;

export const createEquipmentSchema = z.object({
  name: z
    .string({ required_error: 'Укажите название' })
    .trim()
    .min(1, 'Укажите название')
    .max(200, 'Название слишком длинное'),
  make: z.string().max(100, 'Марка слишком длинная').optional(),
  model: z.string().max(100, 'Модель слишком длинная').optional(),
  year: z
    .number({ invalid_type_error: 'Год выпуска — числом' })
    .int('Год выпуска — целым числом')
    .min(1950, 'Год выпуска — не раньше 1950')
    .max(new Date().getFullYear() + 1, 'Год выпуска из будущего')
    .optional(),
  categoryId: z
    .string({ required_error: 'Выберите категорию' })
    .min(1, 'Выберите категорию')
    .max(64),
  companyId: z.string().min(1).max(64),
  locationId: z.string().min(1).max(64).optional(),
  dailyRate: z
    .number({
      required_error: 'Укажите цену за смену',
      invalid_type_error: 'Цену за смену укажите числом',
    })
    .positive('Цена за смену должна быть больше нуля')
    .max(99_999_999, 'Слишком большая цена'),
  hourlyRate: z
    .number({ invalid_type_error: 'Цену за час укажите числом' })
    .positive('Цена за час должна быть больше нуля')
    .max(99_999_999, 'Слишком большая цена')
    .optional(),
  weeklyRate: z.number().positive().optional(),
  monthlyRate: z.number().positive().optional(),
  currency: z.string().length(3).default('RUB'),
  description: z.string().max(5000, 'Описание слишком длинное (до 5000 знаков)').optional(),
  specs: z.record(z.string(), z.unknown()).optional(),
  // Shown on public pages: https only (no javascript:, data: or plain http).
  imageUrls: z
    .array(
      z
        .string()
        .url()
        .regex(/^https:\/\//i, 'Ссылка на фото должна начинаться с https://'),
    )
    .max(20)
    .default([]),
  // A provider may publish a machine straight away or keep it hidden (RETIRED).
  status: equipmentStatusSchema.optional(),
});
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;

/**
 * PATCH /api/equipment/[id]: any subset of the listing's fields. The company
 * never changes; `null` clears an optional price, text or the specs.
 */
export const updateEquipmentSchema = z
  .object({
    name: z.string().trim().min(1, 'Укажите название').max(200, 'Название слишком длинное'),
    make: z.string().trim().max(100, 'Марка слишком длинная').nullable(),
    model: z.string().trim().max(100, 'Модель слишком длинная').nullable(),
    year: z
      .number({ invalid_type_error: 'Год выпуска — числом' })
      .int('Год выпуска — целым числом')
      .min(1950, 'Год выпуска — не раньше 1950')
      .max(new Date().getFullYear() + 1, 'Год выпуска из будущего')
      .nullable(),
    categoryId: z.string().min(1).max(64),
    status: equipmentStatusSchema,
    dailyRate: z
      .number({ invalid_type_error: 'Цену за смену укажите числом' })
      .positive('Цена за смену должна быть больше нуля')
      .max(99_999_999, 'Слишком большая цена'),
    hourlyRate: z
      .number({ invalid_type_error: 'Цену за час укажите числом' })
      .positive('Цена за час должна быть больше нуля')
      .max(99_999_999, 'Слишком большая цена')
      .nullable(),
    description: z.string().max(5000, 'Описание слишком длинное (до 5000 знаков)').nullable(),
    specs: z.record(z.string(), z.unknown()).nullable(),
    imageUrls: z
      .array(
        z
          .string()
          .url('Некорректная ссылка на фото')
          .regex(/^https:\/\//i, 'Ссылка на фото должна начинаться с https://'),
      )
      .max(20, 'Не больше 20 фото'),
  })
  .partial();
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;

export const equipmentSortSchema = z.enum(['newest', 'price_asc', 'price_desc', 'name']);
export type EquipmentSort = z.infer<typeof equipmentSortSchema>;
export const EQUIPMENT_SORT_OPTIONS = equipmentSortSchema.options;

export const equipmentSearchQuerySchema = z.object({
  categoryId: z.string().min(1).max(64).optional(),
  companyId: z.string().min(1).max(64).optional(),
  status: equipmentStatusSchema.optional(),
  city: z.string().optional(),
  minDailyRate: z.number().nonnegative().optional(),
  maxDailyRate: z.number().nonnegative().optional(),
  query: z.string().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sort: equipmentSortSchema.default('newest'),
});
export type EquipmentSearchQuery = z.infer<typeof equipmentSearchQuerySchema>;
