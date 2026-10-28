import { z } from 'zod';

/**
 * «На линии»: the app reports whether the signed-in manager or machinist is
 * online, where the phone is and with which machine (PUT /api/line). Going
 * online needs a position; going offline needs nothing else. Older apps send
 * neither `timeZone` nor `source`.
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
    // The phone's IANA time zone; the route validates it against Intl and
    // ignores junk, so a bad value never fails the report.
    timeZone: z.string().max(64).optional().catch(undefined),
    // Who sends: the open app («foreground», the provider is looking) or the
    // background location task. After the evening cutoff only the provider
    // may put the machine back on the line, never a phone left on.
    source: z.enum(['foreground', 'background', 'web']).optional().catch(undefined),
    // «На линии на 5 рабочих дней» (owner, 2026-10-28): the standing
    // availability. 'days5' — 5 working days (the default when going online),
    // 'until' with `until` (YYYY-MM-DD) — to the end of that day, 'forever' —
    // until switched off, 'off' — off the line altogether. Without it an
    // older app keeps working (lib/lineStanding.ts, api/line).
    standing: z.enum(['days5', 'until', 'forever', 'off']).optional(),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Укажите дату')
      .optional(),
  })
  .refine((data) => data.standing !== 'until' || data.until !== undefined, {
    message: 'Укажите дату, до которой вы на линии',
    path: ['until'],
  })
  .refine(
    (data) =>
      !data.online ||
      // From the cabinet: the machine stands at its base, no phone position needed.
      (data.standing !== undefined && data.standing !== 'off') ||
      (data.lat !== undefined && data.lon !== undefined),
    {
      message: 'Чтобы выйти на линию, разрешите приложению геопозицию',
      path: ['lat'],
    },
  );
export type LinePresenceInput = z.infer<typeof linePresenceSchema>;
