/** Hours in one work shift: the suggested shift price is the hourly price × 8. */
export const SHIFT_HOURS = 8;

/**
 * Shift price suggested for an hourly price as typed in a form field:
 * "2500" → "20000", "312.5" → "2500". Empty or invalid input gives "".
 * Forms re-apply it on every keystroke until the user edits the shift field.
 */
export function suggestShiftRate(hourly: string): string {
  const value = Number(hourly.replace(',', '.'));
  if (!hourly.trim() || !Number.isFinite(value) || value <= 0) return '';
  return String(Math.round(value * SHIFT_HOURS * 100) / 100);
}
