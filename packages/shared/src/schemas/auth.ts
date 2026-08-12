import { z } from 'zod';

export const registerUserSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  phone: z.string().max(30).optional(),
});
export type RegisterUserInput = z.infer<typeof registerUserSchema>;
