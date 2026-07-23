import { z } from 'zod';

export const bookingStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
]);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

export const createBookingSchema = z
  .object({
    equipmentId: z.string().cuid(),
    customerId: z.string().cuid(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    deliveryLocationId: z.string().cuid().optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  });
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const updateBookingStatusSchema = z.object({
  bookingId: z.string().cuid(),
  status: bookingStatusSchema,
});
export type UpdateBookingStatusInput = z.infer<typeof updateBookingStatusSchema>;
