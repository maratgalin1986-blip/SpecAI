import { z } from 'zod';

export const createCompanySchema = z.object({
  name: z.string().min(1).max(200),
  isProvider: z.boolean().default(false),
  taxId: z.string().max(50).optional(),
  phone: z.string().max(30).optional(),
  website: z.string().url().optional(),
  description: z.string().max(2000).optional(),
  locationId: z.string().cuid().optional(),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const userRoleSchema = z.enum([
  'CUSTOMER',
  'PROVIDER_ADMIN',
  'PROVIDER_OPERATOR',
  'PLATFORM_ADMIN',
]);
export type UserRole = z.infer<typeof userRoleSchema>;
