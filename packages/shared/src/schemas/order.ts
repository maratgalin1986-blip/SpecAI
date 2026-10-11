import { z } from 'zod';

export const orderStatusSchema = z.enum(['OPEN', 'MATCHED', 'CANCELLED']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/** One set of order status labels for the site, the API texts and the chat. */
export const ORDER_STATUS_LABELS: Record<OrderStatus | 'PENDING_REVIEW', string> = {
  PENDING_REVIEW: 'На модерации',
  OPEN: 'Открыта',
  MATCHED: 'Исполнитель выбран',
  CANCELLED: 'Отменена',
};

/** The customer cancels an open order (PATCH /api/orders/[id]). */
export const updateOrderSchema = z.object({
  status: z.literal('CANCELLED', {
    errorMap: () => ({ message: 'Заявку можно только отменить' }),
  }),
});

export const createOrderSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1, 'Опишите, какая техника нужна')
      .max(2000, 'Описание слишком длинное (до 2000 знаков)'),
    desiredStartDate: z.coerce.date(),
    desiredEndDate: z.coerce.date(),
    categoryId: z.string().min(1).max(64).optional(),
    // Where the machine is needed — geocoded for the weather and the map.
    address: z.string().trim().max(200).optional(),
  })
  // A one-day job starts and ends on the same date.
  .refine((data) => data.desiredEndDate >= data.desiredStartDate, {
    message: 'Дата окончания не может быть раньше даты начала',
    path: ['desiredEndDate'],
  });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * A guest's order from the site (POST /api/orders/guest): the order fields
 * plus a name, a phone and the consent (152-ФЗ), like a callback lead.
 */
export const createGuestOrderSchema = createOrderSchema.and(
  z.object({
    name: z.string().trim().min(1, 'Укажите имя').max(100, 'Слишком длинное имя'),
    phone: z
      .string()
      .trim()
      .max(30)
      .refine((value) => {
        const digits = value.replace(/\D/g, '').length;
        return digits >= 10 && digits <= 15;
      }, 'Укажите телефон полностью'),
    consent: z.literal(true, {
      errorMap: () => ({ message: 'Нужно согласие на обработку персональных данных' }),
    }),
    // Honeypot: real visitors never fill this hidden field.
    website: z.string().max(0).optional(),
  }),
);
export type CreateGuestOrderInput = z.infer<typeof createGuestOrderSchema>;
