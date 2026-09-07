import { z } from 'zod';

export const bidStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'REJECTED']);
export type BidStatus = z.infer<typeof bidStatusSchema>;

export const createBidSchema = z.object({
  orderId: z.string().cuid(),
  equipmentId: z.string().cuid(),
  price: z.number().positive(),
  currency: z.string().length(3).default('USD'),
  message: z.string().max(1000).optional(),
});
export type CreateBidInput = z.infer<typeof createBidSchema>;
