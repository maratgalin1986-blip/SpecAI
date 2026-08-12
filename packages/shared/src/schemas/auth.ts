import { z } from 'zod';

const baseRegistration = {
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  phone: z.string().max(30).optional(),
};

export const registerCustomerSchema = z.object({
  accountType: z.literal('CUSTOMER'),
  ...baseRegistration,
});
export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;

export const registerProviderSchema = z.object({
  accountType: z.literal('PROVIDER'),
  ...baseRegistration,
  companyName: z.string().min(1).max(200),
});
export type RegisterProviderInput = z.infer<typeof registerProviderSchema>;

export const registerSchema = z.discriminatedUnion('accountType', [
  registerCustomerSchema,
  registerProviderSchema,
]);
export type RegisterInput = z.infer<typeof registerSchema>;
