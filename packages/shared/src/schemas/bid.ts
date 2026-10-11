import { z } from 'zod';

export const bidStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'REJECTED']);
export type BidStatus = z.infer<typeof bidStatusSchema>;

export const createBidSchema = z.object({
  orderId: z.string().min(1).max(64),
  // Equipment ids are not always cuids: the owner's fleet uses "sp16-*".
  equipmentId: z.string().min(1).max(64),
  price: z.number().positive(),
  currency: z.string().length(3).default('RUB'),
  message: z.string().max(1000).optional(),
});
export type CreateBidInput = z.infer<typeof createBidSchema>;

/**
 * Price breakdown of a bid (all optional): подача + смена × смен. When a
 * shift price and the number of shifts are given, `price` must equal the sum
 * (the server checks it, see lib/offerBreakdown.ts).
 */
export const bidBreakdownSchema = z.object({
  deliveryPrice: z
    .number({ invalid_type_error: 'Подача — это число' })
    .min(0, 'Подача не может быть отрицательной')
    .max(99_999_999)
    .optional(),
  shiftPrice: z
    .number({ invalid_type_error: 'Цена смены — это число' })
    .positive('Цена смены должна быть больше нуля')
    .max(99_999_999)
    .optional(),
  shifts: z
    .number({ invalid_type_error: 'Число смен — это число' })
    .int('Число смен — целое')
    .min(1, 'Хотя бы одна смена')
    .max(366)
    .optional(),
  optionsNote: z.string().trim().max(300, 'Опции — до 300 знаков').optional(),
});
export type BidBreakdownInput = z.infer<typeof bidBreakdownSchema>;
