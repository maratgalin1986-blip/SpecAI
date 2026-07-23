import { z } from 'zod';

export const equipmentStatusSchema = z.enum(['AVAILABLE', 'RENTED', 'IN_MAINTENANCE', 'RETIRED']);
export type EquipmentStatus = z.infer<typeof equipmentStatusSchema>;

export const createEquipmentSchema = z.object({
  name: z.string().min(1).max(200),
  make: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  year: z
    .number()
    .int()
    .min(1950)
    .max(new Date().getFullYear() + 1)
    .optional(),
  categoryId: z.string().cuid(),
  companyId: z.string().cuid(),
  locationId: z.string().cuid().optional(),
  dailyRate: z.number().positive(),
  weeklyRate: z.number().positive().optional(),
  monthlyRate: z.number().positive().optional(),
  currency: z.string().length(3).default('USD'),
  description: z.string().max(5000).optional(),
  specs: z.record(z.string(), z.unknown()).optional(),
  imageUrls: z.array(z.string().url()).default([]),
});
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;

export const equipmentSearchQuerySchema = z.object({
  categoryId: z.string().cuid().optional(),
  companyId: z.string().cuid().optional(),
  status: equipmentStatusSchema.optional(),
  city: z.string().optional(),
  minDailyRate: z.number().nonnegative().optional(),
  maxDailyRate: z.number().nonnegative().optional(),
  query: z.string().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type EquipmentSearchQuery = z.infer<typeof equipmentSearchQuerySchema>;
