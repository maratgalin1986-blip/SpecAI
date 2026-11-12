// The заявка of the «Уборка снега» page (components/SnegForm.tsx). Kept apart
// from lib/sneg.ts so the form's client bundle does not pull in the page's
// texts and the city list.

/** The lead source of the page's form: «Уборка снега» in /admin/leads (lib/marketing.ts). */
export const SNEG_SOURCE = 'sneg';

/** The lead's text for the dispatcher: what the page is about plus the two optional fields. */
export function snegLeadMessage(input: { address?: string; what?: string }): string {
  const address = input.address?.trim();
  const what = input.what?.trim();
  return ['Уборка снега', address && `Адрес: ${address}`, what && `Что убрать: ${what}`]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1000);
}
