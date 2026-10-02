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
    // Equipment ids are not always cuids: the owner's fleet uses "sp16-*".
    equipmentId: z.string().min(1).max(64),
    customerId: z.string().min(1).max(64),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    deliveryLocationId: z.string().min(1).max(64).optional(),
    notes: z.string().max(2000).optional(),
  })
  // Both dates are included: a one-day booking starts and ends on the same day.
  .refine((data) => data.endDate >= data.startDate, {
    message: 'Дата окончания не может быть раньше даты начала',
    path: ['endDate'],
  });
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const updateBookingStatusSchema = z.object({
  bookingId: z.string().min(1).max(64),
  status: bookingStatusSchema,
});
export type UpdateBookingStatusInput = z.infer<typeof updateBookingStatusSchema>;
