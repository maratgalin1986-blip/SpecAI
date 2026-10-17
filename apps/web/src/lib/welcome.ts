// «Приветствие перед входом» (owner, 2026-10-17): two paths before signing up
// — «Мне нужна техника» (a customer) and «У меня есть техника» (a provider).
// The same texts are in the app (apps/mobile/src/lib/welcome.ts). Both end
// with the platform's promise (SITE.promise, owner 2026-10-17).
import { SITE } from './site';

export type AccountType = 'CUSTOMER' | 'PROVIDER';

export interface WelcomePath {
  accountType: AccountType;
  /** The value of `?role=` on /register. */
  role: 'customer' | 'provider';
  title: string;
  text: string;
  /** The short link on /login, as the register form names the account type. */
  action: string;
}

export const WELCOME_PATHS: readonly WelcomePath[] = [
  {
    accountType: 'CUSTOMER',
    role: 'customer',
    title: 'Мне нужна техника',
    text: `Разместите заявку: что, где и на какую дату. Исполнители рядом сами пришлют цены — выберете подходящую. ${SITE.promise}.`,
    action: 'Заказать технику',
  },
  {
    accountType: 'PROVIDER',
    role: 'provider',
    title: 'У меня есть техника',
    text: `Зарегистрируйтесь один раз, выйдите на линию с машиной — заявки рядом приходят сами, цену называете вы. ${SITE.promise}.`,
    action: 'Встать на линию',
  },
];

/**
 * The account type /register opens with: `?role=customer|provider` (the
 * welcome cards, /login), the older `?type=provider`; null when the query
 * names none (the form then starts as a customer).
 */
export function accountTypeFromQuery(params: URLSearchParams): AccountType | null {
  const raw = (params.get('role') ?? params.get('type') ?? '').trim().toLowerCase();
  if (raw === 'provider') return 'PROVIDER';
  if (raw === 'customer') return 'CUSTOMER';
  return null;
}
