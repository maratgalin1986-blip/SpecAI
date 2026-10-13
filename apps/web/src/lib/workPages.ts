// Pages where people work rather than browse: the cabinets, an order's own
// page, the admin and the sign-in forms. The guest contact bar (call / WhatsApp
// / «Заявка») stays off them, so it never covers their forms and buttons on a
// phone and never offers СпецПласт16's callback inside a provider's cabinet.

/** Cabinets, an order page, the admin: no music and no guest contact bar. */
const CABINET = /^\/(dashboard|provider|admin)(\/|$)|^\/orders\/[^/]+\/?$/;
/** Sign-in and account forms. */
const ACCOUNT = /^\/(login|register|forgot-password|reset-password|verify-email)(\/|$)/;

export function isCabinetPage(pathname: string | null | undefined): boolean {
  return CABINET.test(pathname ?? '');
}

/** The mobile contact bar is hidden here (MessengerButtons). */
export function hidesContactBar(pathname: string | null | undefined): boolean {
  const path = pathname ?? '';
  return isCabinetPage(path) || ACCOUNT.test(path) || /^\/stroyka(\/|$)/.test(path);
}
