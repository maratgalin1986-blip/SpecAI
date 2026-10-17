// «Утром на линию — вечером автоматически снимаемся» (owner, 2026-10-17).
// A provider goes online in the morning; in the evening the line switches
// itself off. The phone does it in its own local time (apps/mobile
// src/lib/line.ts, the same rule); the server repeats the rule as a safety
// net for a phone that died or an older app: it reads the phone's time zone
// from LinePresence.timeZone (Moscow when unknown — the platform serves all
// of Russia, so the day is the provider's own, not Moscow's).

/** The hour (local to the provider) after which a morning session ends. */
export const LINE_EVENING_OFF_HOUR = 21;
/** When the phone never told its time zone (older app, junk value). */
export const LINE_DEFAULT_TIME_ZONE = 'Europe/Moscow';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    // A handful of Russian zones in practice; the cap only guards memory.
    if (formatters.size < 64) formatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * An IANA time zone the phone sent («Asia/Novosibirsk»), canonical as Intl
 * spells it, or null for anything else (junk is ignored, never an error).
 */
export function validTimeZone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value.length < 3 || value.length > 64 || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value)) {
    return null;
  }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** The local calendar day («2026-10-17») and hour (0–23) of a moment in a zone. */
export function localDayHour(date: Date, timeZone: string): { day: string; hour: number } {
  const parts = formatterFor(timeZone).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return {
    day: `${part('year')}-${part('month')}-${part('day')}`,
    hour: Number(part('hour')) % 24,
  };
}

/**
 * Whether a line session that began at `since` is over at `now`: the
 * evening cutoff passed after it began (it began before the cutoff and now
 * is past it), or it began on an earlier local day. A provider who switches
 * on again after the cutoff (working late) stays on until midnight.
 */
export function lineSessionExpired(
  since: Date,
  now: Date,
  timeZone: string | null | undefined,
  cutoffHour: number = LINE_EVENING_OFF_HOUR,
): boolean {
  if (now.getTime() <= since.getTime()) return false;
  const zone = validTimeZone(timeZone) ?? LINE_DEFAULT_TIME_ZONE;
  const start = localDayHour(since, zone);
  const current = localDayHour(now, zone);
  if (start.day !== current.day) return true;
  return start.hour < cutoffHour && current.hour >= cutoffHour;
}

/** Local time is past the evening cutoff (a new session must not start by itself). */
export function afterEveningCutoff(
  now: Date,
  timeZone: string | null | undefined,
  cutoffHour: number = LINE_EVENING_OFF_HOUR,
): boolean {
  return localDayHour(now, validTimeZone(timeZone) ?? LINE_DEFAULT_TIME_ZONE).hour >= cutoffHour;
}

/** From this local hour a new working day begins (an older app's session may renew). */
export const LINE_MORNING_HOUR = 5;

/** Local time is within the working day: from LINE_MORNING_HOUR until the evening cutoff. */
export function withinLineDay(
  now: Date,
  timeZone: string | null | undefined,
  cutoffHour: number = LINE_EVENING_OFF_HOUR,
): boolean {
  const { hour } = localDayHour(now, validTimeZone(timeZone) ?? LINE_DEFAULT_TIME_ZONE);
  return hour >= LINE_MORNING_HOUR && hour < cutoffHour;
}

/**
 * A LinePresence row whose session the evening cutoff has ended, though the
 * phone may still be sending (a phone left on, an older app). Rows without
 * `onlineSince` (written before it existed) are judged by freshness only.
 */
export function presenceAutoOff(
  row: { onlineSince?: Date | null; timeZone?: string | null },
  now: Date,
): boolean {
  return row.onlineSince ? lineSessionExpired(row.onlineSince, now, row.timeZone) : false;
}
