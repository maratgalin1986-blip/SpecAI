import { z } from 'zod';

/**
 * «На линии»: the app reports whether the signed-in manager or machinist is
 * online, where the phone is and with which machine (PUT /api/line). Going
 * online needs a position; going offline needs nothing else.
 */
export const linePresenceSchema = z
  .object({
    online: z.boolean(),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    // Equipment ids are not always cuids: the house fleet uses "sp16-*".
    equipmentId: z.string().trim().min(1).max(64).nullable().optional(),
    note: z
      .string()
      .trim()
      .max(80, 'Не длиннее 80 знаков')
      .optional()
      .transform((value) => value || undefined),
  })
  .refine((data) => !data.online || (data.lat !== undefined && data.lon !== undefined), {
    message: 'Чтобы выйти на линию, разрешите приложению геопозицию',
    path: ['lat'],
  });
export type LinePresenceInput = z.infer<typeof linePresenceSchema>;
