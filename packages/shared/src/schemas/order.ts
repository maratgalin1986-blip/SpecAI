import { z } from 'zod';

export const orderStatusSchema = z.enum(['OPEN', 'MATCHED', 'CANCELLED']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const createOrderSchema = z
  .object({
    description: z.string().min(1).max(2000),
    desiredStartDate: z.coerce.date(),
    desiredEndDate: z.coerce.date(),
    categoryId: z.string().cuid().optional(),
  })
  .refine((data) => data.desiredEndDate > data.desiredStartDate, {
    message: 'desiredEndDate must be after desiredStartDate',
    path: ['desiredEndDate'],
  });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
