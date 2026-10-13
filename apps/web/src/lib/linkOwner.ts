// «Привязать аккаунт» in /admin: makes a registered user the manager of
// СпецПласт16's own fleet. Pure rules, unit-tested; api/admin/link-owner
// shows the admin whose account it is first and changes it only on confirm.

export interface LinkCandidate {
  role: string;
  companyId: string | null;
  companyName?: string | null;
  /** Orders the account placed as a customer. */
  orders: number;
}

export type LinkDecision =
  { kind: 'already' } | { kind: 'refuse'; error: string } | { kind: 'allow'; warnings: string[] };

const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: 'заказчик',
  PROVIDER_ADMIN: 'управляющий исполнителя',
  PROVIDER_OPERATOR: 'машинист',
  PLATFORM_ADMIN: 'сотрудник платформы',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * Never takes an account away from another provider company (it would be
 * left with no users) or from the platform staff; a customer with orders is
 * allowed after a warning.
 */
export function linkOwnerDecision(user: LinkCandidate, houseCompanyId: string): LinkDecision {
  if (user.companyId === houseCompanyId && user.role === 'PROVIDER_ADMIN') {
    return { kind: 'already' };
  }
  if (user.role === 'PLATFORM_ADMIN') {
    return { kind: 'refuse', error: 'Это аккаунт сотрудника платформы — его не привязываем.' };
  }
  if (user.companyId && user.companyId !== houseCompanyId) {
    return {
      kind: 'refuse',
      error: `Аккаунт уже работает в компании «${user.companyName ?? 'другой исполнитель'}». Привяжите другой e-mail.`,
    };
  }
  const warnings: string[] = [];
  if (user.orders > 0) {
    warnings.push(
      `У аккаунта есть заявки как у заказчика (${user.orders}): после привязки он станет исполнителем.`,
    );
  }
  return { kind: 'allow', warnings };
}
