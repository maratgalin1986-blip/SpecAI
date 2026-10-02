import { z } from 'zod';

export const orderStatusSchema = z.enum(['OPEN', 'MATCHED', 'CANCELLED']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const createOrderSchema = z
  .object({
    description: z.string().min(1).max(2000),
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
