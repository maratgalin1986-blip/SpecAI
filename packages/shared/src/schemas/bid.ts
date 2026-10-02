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
